const Parser = require('rss-parser');

class NewsService {
    constructor() {
        this.parser = new Parser();
    }

    _guessSentiment(title) {
        const text = title.toLowerCase();
        const pos = ['profit', 'growth', 'record', 'surge', 'gain', 'beat', 'strong', 'rise', 'up', 'dividend', 'buyback', 'order'];
        const neg = ['loss', 'fall', 'drop', 'decline', 'weak', 'miss', 'concern', 'risk', 'down', 'cut', 'probe', 'fraud', 'penalty', 'sell'];
        if (pos.some(w => text.includes(w))) return 'positive';
        if (neg.some(w => text.includes(w))) return 'negative';
        return 'neutral';
    }

    async getLatestNews(symbol) {
        try {
            const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock news india')}&hl=en-IN&gl=IN&ceid=IN:en`;
            const feed = await this.parser.parseURL(feedUrl);
            return feed.items.slice(0, 8).map(item => ({
                title: item.title,
                link: item.link,
                publishedAt: item.pubDate,
                source: item.source || 'Google News',
                sentiment: this._guessSentiment(item.title)
            }));
        } catch (error) {
            return [];
        }
    }
}
module.exports = new NewsService();