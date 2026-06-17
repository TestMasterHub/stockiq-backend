const axios = require('axios');
const cheerio = require('cheerio');

class DataScraperService {
    constructor() {
        this.client = axios.create({
            baseURL: 'https://www.screener.in',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' },
            timeout: 8000
        });
    }

    async getShareholding(symbol) {
        try {
            const response = await this.client.get(`/company/${symbol}/consolidated/`);
            const $ = cheerio.load(response.data);
            const shareholding = { promoter: 'N/A', fii: 'N/A', dii: 'N/A', public: 'N/A' };

            $('#shareholding table tbody tr').each((i, el) => {
                const label = $(el).find('td').first().text().trim().toLowerCase();
                const latestValue = $(el).find('td').last().text().trim() + '%';
                if (label.includes('promoter')) shareholding.promoter = latestValue;
                if (label.includes('fii')) shareholding.fii = latestValue;
                if (label.includes('dii')) shareholding.dii = latestValue;
                if (label.includes('public')) shareholding.public = latestValue;
            });
            return shareholding;
        } catch (error) {
            return null; // Graceful degradation
        }
    }

    async getCorporateActions(symbol) {
        try {
            const response = await this.client.get(`/company/${symbol}/consolidated/`);
            const $ = cheerio.load(response.data);
            const actions = [];

            $('#announcements .list-links li').slice(0, 5).each((i, el) => {
                const title = $(el).find('a').text().trim();
                const date = $(el).find('.ink-600').text().trim();
                const link = $(el).find('a').attr('href');
                
                let type = "Announcement";
                let icon = "📢";
                if (title.toLowerCase().includes('dividend')) { type = 'Dividend'; icon = '💰'; }
                else if (title.toLowerCase().includes('split')) { type = 'Stock Split'; icon = '✂'; }
                else if (title.toLowerCase().includes('bonus')) { type = 'Bonus Issue'; icon = '🎁'; }
                else if (title.toLowerCase().includes('buyback')) { type = 'Buyback'; icon = '🔄'; }

                actions.push({ icon, type, note: title, date, url: link });
            });
            return actions.length ? actions : [{ icon: "ℹ", type: "No recent actions", note: "No major corporate actions found." }];
        } catch (error) {
            return [];
        }
    }
}
module.exports = new DataScraperService();