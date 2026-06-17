// Import the v3 class defensively to support both CommonJS and ES Modules
const yahooFinanceImport = require('yahoo-finance2');
const YahooFinance = yahooFinanceImport.default || yahooFinanceImport;
const yahooFinance = new YahooFinance();

const AppError = require('../errors/AppError');

class YahooAdapterService {
    async getQuoteEquity(symbol) {
        // Yahoo uses .NS for Indian National Stock Exchange
        const yfSymbol = `${symbol.toUpperCase()}.NS`;

        try {
            // Added quarterly and annual income statement modules for full P&L
            const quoteSummary = await yahooFinance.quoteSummary(yfSymbol, {
                modules: [
                    'price', 
                    'summaryDetail', 
                    'financialData', 
                    'defaultKeyStatistics', 
                    'incomeStatementHistory',
                    'incomeStatementHistoryQuarterly',
                    'balanceSheetHistory',
                    'majorHoldersBreakdown',
                    'assetProfile' 
                ]
            });

            if (!quoteSummary) throw new Error("No data returned from Yahoo");

            const { 
                price = {}, 
                summaryDetail = {}, 
                financialData = {}, 
                defaultKeyStatistics = {},
                incomeStatementHistory = {},
                incomeStatementHistoryQuarterly = {},
                balanceSheetHistory = {},
                majorHoldersBreakdown = {},
                assetProfile = {}
            } = quoteSummary;

            const latestBalance = balanceSheetHistory.balanceSheetStatements?.[0] || {};
            
            // Extract the Historical P&L Arrays
            const annualIncomeStatements = incomeStatementHistory.incomeStatementHistory || [];
            const quarterlyIncomeStatements = incomeStatementHistoryQuarterly.incomeStatementHistory || [];
            const latestIncome = annualIncomeStatements[0] || {};

            // Helper to format Yahoo's messy P&L into a clean array for your React UI tables
            const formatPnL = (statements) => statements.map(stmt => ({
                date: stmt.endDate ? new Date(stmt.endDate).toLocaleDateString() : "—",
                year: stmt.endDate ? new Date(stmt.endDate).getFullYear() : "—",
                totalRevenue: stmt.totalRevenue || 0,
                costOfRevenue: stmt.costOfRevenue || 0,
                grossProfit: stmt.grossProfit || 0,
                operatingExpenses: stmt.totalOperatingExpenses || 0,
                operatingIncome: stmt.operatingIncome || 0,
                ebit: stmt.ebit || 0,
                interestExpense: stmt.interestExpense || 0,
                incomeBeforeTax: stmt.incomeBeforeTax || 0,
                taxProvision: stmt.incomeTaxExpense || 0,
                netIncome: stmt.netIncome || 0,
            }));

            return {
                info: {
                    symbol: symbol,
                    companyName: price.longName || price.shortName || symbol,
                    sector: assetProfile.sector || "—",
                    industry: assetProfile.industry || "—",
                    exchange: price.exchangeName || "NSE",
                    employees: assetProfile.fullTimeEmployees || null,
                    currency: price.currency || "INR"
                },
                priceInfo: {
                    lastPrice: price.regularMarketPrice || 0,
                    change: price.regularMarketChange || 0,
                    pChange: (price.regularMarketChangePercent || 0) * 100, 
                    previousClose: price.regularMarketPreviousClose || 0,
                    open: price.regularMarketOpen || 0,
                    close: price.regularMarketPrice || 0,
                    vwap: price.regularMarketPrice || 0, 
                    lowerCP: "-", 
                    upperCP: "-"
                },
                metadata: {
                    lastUpdateTime: price.regularMarketTime 
                        ? new Date(price.regularMarketTime).toLocaleString() 
                        : new Date().toLocaleString()
                },
                fundamentals: {
                    marketCap: price.marketCap || summaryDetail.marketCap || 0,
                    peRatio: summaryDetail.trailingPE || 0,
                    pbRatio: defaultKeyStatistics.priceToBook || 0,
                    eps: defaultKeyStatistics.trailingEps || 0,
                    dividendYield: (summaryDetail.dividendYield || 0) * 100,
                    roe: (financialData.returnOnEquity || 0) * 100,
                    roa: (financialData.returnOnAssets || 0) * 100,
                    bookValue: defaultKeyStatistics.bookValue || 0,
                    fiftyTwoWeekHigh: summaryDetail.fiftyTwoWeekHigh || 0,
                    fiftyTwoWeekLow: summaryDetail.fiftyTwoWeekLow || 0,
                    debtToEquity: financialData.debtToEquity || 0,
                    profitMargin: (financialData.profitMargins || 0) * 100
                },
                financials: {
                    totalRevenue: financialData.totalRevenue || latestIncome.totalRevenue || 0,
                    netIncome: latestIncome.netIncome || 0,
                    operatingIncome: latestIncome.operatingIncome || 0,
                    totalAssets: latestBalance.totalAssets || 0,
                    totalLiabilities: latestBalance.totalLiab || 0,
                    totalCash: financialData.totalCash || 0,
                    totalDebt: financialData.totalDebt || 0,
                    
                    // ─────────────────────────────────────────────
                    // FULL HISTORICAL P&L ARRAYS
                    // ─────────────────────────────────────────────
                    pnlAnnual: formatPnL(annualIncomeStatements),
                    pnlQuarterly: formatPnL(quarterlyIncomeStatements)
                },
                shareholding: {
                    promoter: ((majorHoldersBreakdown.insidersPercentHeld || 0) * 100).toFixed(2) + '%',
                    institutions: ((majorHoldersBreakdown.institutionsPercentHeld || 0) * 100).toFixed(2) + '%'
                }
            };

        } catch (error) {
            console.error(`[YahooAdapter] Failed for ${symbol}:`, error.message);
            throw new AppError(`Failed to fetch deep market data for ${symbol}.`, 502);
        }
    }
}

module.exports = new YahooAdapterService();