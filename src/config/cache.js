const NodeCache = require('node-cache');

class CacheManager {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 180, checkperiod: 120 }); // 3 min cache
        this._activeRequests = new Map();
    }

    async getOrFetch(key, fetchFunction) {
        const cachedData = this.cache.get(key);
        if (cachedData) return cachedData;

        if (this._activeRequests.has(key)) {
            return this._activeRequests.get(key);
        }

        const fetchPromise = fetchFunction()
            .then(data => {
                this.cache.set(key, data);
                this._activeRequests.delete(key);
                return data;
            })
            .catch(err => {
                this._activeRequests.delete(key);
                throw err;
            });

        this._activeRequests.set(key, fetchPromise);
        return fetchPromise;
    }
}
module.exports = new CacheManager();