const Groq = require('groq-sdk');
const AppError = require('../errors/AppError');

class AiService {
    constructor() {
        this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        this.modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    }

    async _callGroqWithRetry(messages, retries = 3, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                const completion = await this.groq.chat.completions.create({
                    messages,
                    model: this.modelName,
                    temperature: 0.1, 
                    response_format: { type: 'json_object' }
                });
                return JSON.parse(completion.choices[0].message.content);
            } catch (error) {
                if (error.status === 429 && i < retries - 1) {
                    console.warn(`[AI Service] Free tier limit hit. Silently retrying in ${delay / 1000}s...`);
                    await new Promise(res => setTimeout(res, delay));
                    delay *= 2; 
                } else {
                    throw error;
                }
            }
        }
    }

    async generateSignal(ctx) {
        const { symbol, price, changePercent, trend, rsi, sma20, sma50, volume, peRatio, marketCap, shareholding, news } = ctx;

        const topNews = (news || []).slice(0, 3)
            .map(n => `[${n.sentiment.toUpperCase()}] ${n.title}`)
            .join(' | ');

        const sh = shareholding || {};
        
        // ─────────────────────────────────────────────────────────────────
        // ENHANCED, HIGHLY SPECIFIC INSTITUTIONAL PROMPT
        // ─────────────────────────────────────────────────────────────────
        const prompt = `
            Role: Elite SEBI-Grade Quantitative & Fundamental Equity Strategist (NSE/BSE).
            Persona: You are a ruthless, data-driven institutional algorithmic trader. You synthesize technical momentum convergence, deep-value fundamental metrics, institutional order flow (FII/DII accumulation/distribution), and NLP macroeconomic sentiment to identify high-probability, asymmetric risk-reward trading setups. You do not give generic advice; you give precise, mathematical verdicts.
            Task: Analyze the ${symbol} data matrix below and generate a strict JSON trade signal.

            DATA MATRIX:
            - Price Action: ₹${price} (${changePercent}%) | Vol: ${volume} | Trend: ${trend}
            - Technicals: RSI(14): ${rsi} | SMA20: ₹${sma20} | SMA50: ₹${sma50}
            - Fundamentals: MCap: ₹${marketCap}Cr | PE: ${peRatio}
            - Institutional Flow: Prom: ${sh.promoter || 'N/A'} | FII: ${sh.fii || 'N/A'} | DII: ${sh.dii || 'N/A'}
            - Sentiment/Catalysts: ${topNews || "None"}
            
            OUTPUT EXACT JSON FORMAT ONLY:
            {
              "entry_price": <number>,
              "target_price": <number>,
              "stop_loss": <number>,
              "rr_ratio": <string>,
              "composite_score": <1-10>,
              "fundamental_score": <1-10>,
              "technical_score": <1-10>,
              "sentiment_score": <1-10>,
              "verdict": <"STRONG BUY" | "BUY" | "HOLD" | "AVOID" | "STRONG AVOID">,
              "timeframe": <"Short" | "Medium" | "Long">,
              "reasoning": <"2 sharp, analytical sentences explaining the convergence of technicals and fundamentals">,
              "key_points": <["array", "of", "3", "bullish catalysts or bearish risks"]>
            }
        `;

        try {
            return await this._callGroqWithRetry([{ role: 'user', content: prompt }]);
        } catch (error) {
            console.error(`[AI Service Error]:`, error.message);
            throw new AppError('AI is currently analyzing too many requests. Please try again in a few seconds.', 503);
        }
    }
}

module.exports = new AiService();