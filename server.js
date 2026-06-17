// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const apiRoutes = require('./src/routes/api.routes');
const errorHandler = require('./src/middlewares/errorHandler');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 5656;

// Security and Performance
app.use(helmet());
app.use(compression()); 
app.use(cors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:3000'], 
    credentials: true
}));
app.use(express.json());

// Main API Router
app.use('/api', apiRoutes);

// Yahoo Finance Stream Passthrough (Optimal Performance)
app.use('/yf', createProxyMiddleware({
    target: 'https://query1.finance.yahoo.com',
    changeOrigin: true,
    pathRewrite: { '^/yf': '' },
    on: {
        proxyReq: (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
            proxyReq.setHeader('Referer', 'https://finance.yahoo.com/');
            proxyReq.removeHeader('x-forwarded-for');
        }
    }
}));

// Global Error Handler
app.use(errorHandler);

// Process-level unhandled rejection trap
process.on('unhandledRejection', err => {
    console.error('💥 UNHANDLED REJECTION! Shutting down gracefully...', err.name, err.message);
    process.exit(1);
});

app.listen(PORT, () => {
    console.log(`🚀 VeeraStockIQ AI Engine running on port ${PORT}`);
});