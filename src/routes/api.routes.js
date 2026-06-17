const express = require('express');
const router = express.Router();
const YahooAdapterService = require('../services/YahooAdapterService');
const AiService = require('../services/AiService');
const DataScraperService = require('../services/DataScraperService');
const NewsService = require('../services/NewsService');
const CacheManager = require('../config/cache');

// 1. Live Market Data Adapter (Replaces NSE)
router.get(/^\/nse(?:\/.*)?$/, async (req, res, next) => {
    try {
        const endpoint = req.originalUrl.split('/api/nse')[1];
        
        // Intercept the specific quote-equity call
        if (endpoint.includes('/api/quote-equity')) {
            const symbol = req.query.symbol;
            if (!symbol) return res.status(400).json({ error: "Symbol required" });

            const data = await CacheManager.getOrFetch(`QUOTE_${symbol}`, () => YahooAdapterService.getQuoteEquity(symbol));
            return res.json(data);
        }

        // If the UI requests anything else from NSE, fail gracefully
        res.status(404).json({ error: "Endpoint not supported in Yahoo Adapter mode." });

    } catch (error) { next(error); }
});

// 2. Deep Data: Shareholding 
router.get('/stock/:symbol/shareholding', async (req, res, next) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const data = await CacheManager.getOrFetch(`SH_${symbol}`, () => DataScraperService.getShareholding(symbol));
        res.json({ symbol, shareholding: data });
    } catch (error) { next(error); }
});

// 3. Deep Data: Corporate Actions 
router.get('/stock/:symbol/corporate-actions', async (req, res, next) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const data = await CacheManager.getOrFetch(`CORP_${symbol}`, () => DataScraperService.getCorporateActions(symbol));
        res.json({ symbol, actions: data });
    } catch (error) { next(error); }
});

// 4. Deep Data: News Feed & Sentiment
router.get('/stock/:symbol/news', async (req, res, next) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const data = await CacheManager.getOrFetch(`NEWS_${symbol}`, () => NewsService.getLatestNews(symbol));
        res.json({ symbol, news: data });
    } catch (error) { next(error); }
});

// 5. AI Signal Generator 
router.post('/ai/signals', async (req, res, next) => {
    try {
        const stockContext = req.body;
        if (!stockContext || !stockContext.symbol) {
            return res.status(400).json({ error: 'Missing stock context payload' });
        }
        const signalData = await AiService.generateSignal(stockContext);
        res.json(signalData);
    } catch (error) { next(error); }
});

module.exports = router;