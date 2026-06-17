const Groq = require('groq-sdk');
const AppError = require('../errors/AppError');

class AiService {
    constructor() {
        this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }

    async generateSignal(ctx) {
        const { symbol, price, changePercent, trend, rsi, sma20, sma50, volume, peRatio, marketCap, shareholding, news } = ctx;

        const newsHeadlines = news && news.length > 0 
            ? news.map((n, i) => `${i + 1}. [${n.sentiment.toUpperCase()}] ${n.title}`).join('\n')
            : "No recent news available.";

        const sh = shareholding || {};
        
        const prompt = `
            You are an expert Indian stock market quantitative and fundamental analyst.
            Analyze the following data for ${symbol} and generate a trade signal.

            1. LIVE PRICE & TECHNICALS:
            - Price: ₹${price} (${changePercent}%) | Volume: ${volume}
            - Trend: ${trend} | RSI (14): ${rsi}
            - SMA20: ₹${sma20} | SMA50: ₹${sma50}

            2. FUNDAMENTALS & SHAREHOLDING:
            - Market Cap: ₹${marketCap} Cr | P/E Ratio: ${peRatio}
            - Promoter Holding: ${sh.promoter || 'Unknown'} | FII Holding: ${sh.fii || 'Unknown'} | DII Holding: ${sh.dii || 'Unknown'}

            3. RECENT NEWS & SENTIMENT:
            ${newsHeadlines}
            
            INSTRUCTIONS: Provide a STRICT JSON object ONLY with exactly these keys:
            {
              "entry_price": <number>,
              "target_price": <number>,
              "stop_loss": <number>,
              "rr_ratio": <string>,
              "composite_score": <integer 1-10>,
              "fundamental_score": <integer 1-10>,
              "technical_score": <integer 1-10>,
              "sentiment_score": <integer 1-10>,
              "verdict": <"STRONG BUY" | "BUY" | "HOLD" | "AVOID" | "STRONG AVOID">,
              "timeframe": <"Short-term" | "Medium-term" | "Long-term">,
              "reasoning": <string, 2-3 sentences explaining the thesis>,
              "key_points": <array of 3 to 5 strings highlighting catalysts/risks>
            }
        `;

        try {
            const completion = await this.groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama3-70b-8192',
                temperature: 0.1, 
                response_format: { type: 'json_object' }
            });
            return JSON.parse(completion.choices[0].message.content);
        } catch (error) {
            throw new AppError('AI Analysis Service currently unavailable.', 503);
        }
    }
}
module.exports = new AiService();