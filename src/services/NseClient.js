const https = require('https');
const http = require('http');
const { URL } = require('url');
const AppError = require('../errors/AppError');

class NseClient {
    constructor() {
        if (NseClient.instance) return NseClient.instance;

        this.cookieJar = {};          
        this.sessionReady = false;
        this.sessionTimestamp = 0;
        this.SESSION_TTL = 5 * 60 * 1000;
        this.sessionLock = null;

        // Matches setupProxy.js base headers exactly
        this.baseHeaders = {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept':          'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer':         'https://www.nseindia.com/market-data/live-equity-market',
            'Host':            'www.nseindia.com',
        };

        NseClient.instance = this;
    }

    // ── Cookie helpers (identical to setupProxy.js) ────────────────────────

    _storeCookies(hostname, setCookieHeaders) {
        if (!setCookieHeaders?.length) return;
        if (!this.cookieJar[hostname]) this.cookieJar[hostname] = {};
        setCookieHeaders.forEach((raw) => {
            const part = raw.split(';')[0].trim();
            const eq = part.indexOf('=');
            if (eq < 0) return;
            const name = part.slice(0, eq).trim();
            const value = part.slice(eq + 1).trim();
            this.cookieJar[hostname][name] = value;
        });
    }

    _getCookieString(hostname) {
        const jar = this.cookieJar[hostname] || {};
        return Object.entries(jar)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    // ── Core request method ────────────────────────────────────────────────

    _request(urlStr, extraHeaders = {}) {
        return new Promise((resolve, reject) => {
            const parsed = new URL(urlStr);
            const lib = parsed.protocol === 'https:' ? https : http;
            const cookies = this._getCookieString(parsed.hostname);

            const options = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers: {
                    ...this.baseHeaders,
                    ...(cookies ? { Cookie: cookies } : {}),
                    ...extraHeaders,
                },
            };

            const req = lib.request(options, (res) => {
                this._storeCookies(parsed.hostname, res.headers['set-cookie']);

                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    const next = new URL(res.headers.location, urlStr).toString();
                    res.resume();
                    return this._request(next, extraHeaders).then(resolve).catch(reject);
                }

                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString('utf-8'),
                }));
            });

            req.on('error', reject);
            req.setTimeout(15000, () => {
                req.destroy();
                reject(new Error('timeout'));
            });
            req.end();
        });
    }

    // ── Session Init ───────────────────────────────────────────────────────

    async _initSession() {
        if (this.sessionReady && (Date.now() - this.sessionTimestamp < this.SESSION_TTL)) return;
        if (this.sessionLock) return this.sessionLock;

        this.sessionLock = (async () => {
            console.log('[NSE] Initialising session...');
            try {
                // 1. Homepage
                await this._request('https://www.nseindia.com/', {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Upgrade-Insecure-Requests': '1',
                });

                // 2. Market Data 
                await this._request('https://www.nseindia.com/market-data/live-equity-market', {
                    'Referer': 'https://www.nseindia.com/',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                });

                // 3. API Ping
                const check = await this._request('https://www.nseindia.com/api/marketStatus', {
                    'Referer': 'https://www.nseindia.com/market-data/live-equity-market',
                    'X-Requested-With': 'XMLHttpRequest',
                });

                if (check.status === 200) {
                    this.sessionReady = true;
                    this.sessionTimestamp = Date.now();
                    console.log('[NSE] ✅ Session ready.');
                } else {
                    throw new Error(`Init failed (${check.status})`);
                }
            } catch (err) {
                this.sessionReady = false;
                throw new AppError('Failed to establish NSE session', 502);
            } finally {
                this.sessionLock = null;
            }
        })();

        return this.sessionLock;
    }

    // ── Public Data Fetcher ────────────────────────────────────────────────

    async fetchData(endpoint) {
        await this._initSession();

        const safeEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        const fullUrl = `https://www.nseindia.com${safeEndpoint}`;

        // MATCH FRONTEND PROXY EXACTLY
        const apiHeaders = {
            'Accept': 'application/json, text/plain, */*', 
            'Referer': 'https://www.nseindia.com/',
            'X-Requested-With': 'XMLHttpRequest'
        };

        try {
            let result = await this._request(fullUrl, apiHeaders);

            if (result.body.trim().startsWith('<') || result.status === 401 || result.status === 403) {
                console.warn(`[NSE] Blocked (${result.status}). Purging poisoned cookies and reinitialising...`);
                
                // CRITICAL FIX: Wipe the flagged WAF cookie so Akamai doesn't auto-reject the retry
                this.sessionReady = false;
                this.cookieJar = {}; 
                
                // CRITICAL FIX: Human-like micro-delay to avoid script velocity detection
                await new Promise(r => setTimeout(r, 1200));

                await this._initSession();
                
                // Secondary delay before immediately requesting data again
                await new Promise(r => setTimeout(r, 800));

                result = await this._request(fullUrl, apiHeaders);

                if (result.body.trim().startsWith('<') || result.status >= 400) {
                    console.error(`[NSE] Still failing after reinit (${result.status})`);
                    throw new AppError('NSE API unavailable: Akamai is blocking this server IP.', 503);
                }
            }

            if (result.status >= 400) {
                throw new AppError(`NSE API Error: HTTP ${result.status}`, 502);
            }

            return JSON.parse(result.body);
            
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(`NSE Data Error: ${error.message}`, 502);
        }
    }
}

const nseClient = new NseClient();
nseClient._initSession().catch(() => {});
module.exports = nseClient;