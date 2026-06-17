const https = require('https');
const http = require('http');
const { URL } = require('url');
const AppError = require('../errors/AppError');

class NseClient {
    constructor() {
        if (NseClient.instance) return NseClient.instance;

        this.cookieJar = {}; // Mimicking your setupProxy.js cookie jar
        this.sessionReady = false;
        this.sessionTimestamp = 0;
        this.SESSION_TTL = 5 * 60 * 1000;
        this.sessionLock = null;

        // Exact headers from your working frontend proxy to bypass Akamai WAF
        this.baseHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.nseindia.com/market-data/live-equity-market",
            "Host": "www.nseindia.com"
        };

        NseClient.instance = this;
    }

    // --- Private Methods (Native HTTPS Request & Cookie Management) ---

    _storeCookies(hostname, setCookieHeaders) {
        if (!setCookieHeaders?.length) return;
        if (!this.cookieJar[hostname]) this.cookieJar[hostname] = {};
        setCookieHeaders.forEach((raw) => {
            const part = raw.split(";")[0].trim();
            const eq = part.indexOf("=");
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
            .join("; ");
    }

    _request(urlStr, extraHeaders = {}) {
        return new Promise((resolve, reject) => {
            const parsed = new URL(urlStr);
            const lib = parsed.protocol === "https:" ? https : http;
            const cookies = this._getCookieString(parsed.hostname);

            const options = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: "GET",
                headers: {
                    ...this.baseHeaders,
                    ...(cookies ? { Cookie: cookies } : {}),
                    ...extraHeaders,
                },
            };

            const req = lib.request(options, (res) => {
                this._storeCookies(parsed.hostname, res.headers["set-cookie"]);

                // Follow redirects transparently
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    const next = new URL(res.headers.location, urlStr).toString();
                    res.resume();
                    return this._request(next, extraHeaders).then(resolve).catch(reject);
                }

                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString("utf-8"),
                }));
            });

            req.on("error", reject);
            req.setTimeout(15000, () => {
                req.destroy();
                reject(new Error("timeout"));
            });
            req.end();
        });
    }

    // --- Public Methods ---

    async _initSession() {
        if (this.sessionReady && (Date.now() - this.sessionTimestamp < this.SESSION_TTL)) return;
        if (this.sessionLock) return this.sessionLock; // Prevent concurrent inits

        this.sessionLock = (async () => {
            console.log("[NSE] Initialising session natively...");
            try {
                // 1. Hit Homepage for base cookies
                await this._request("https://www.nseindia.com/", {
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "Upgrade-Insecure-Requests": "1",
                });

                // 2. Hit Market Data for session tokens
                await this._request("https://www.nseindia.com/market-data/live-equity-market", {
                    "Referer": "https://www.nseindia.com/",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                });

                // 3. Confirm Session with API ping
                const check = await this._request("https://www.nseindia.com/api/marketStatus", {
                    "Referer": "https://www.nseindia.com/market-data/live-equity-market",
                    "X-Requested-With": "XMLHttpRequest",
                });

                if (check.status === 200) {
                    this.sessionReady = true;
                    this.sessionTimestamp = Date.now();
                    console.log("[NSE] Session ready. Cookies active.");
                } else {
                    throw new Error(`Init failed with status ${check.status}`);
                }
            } catch (error) {
                console.error("[NSE] Session init failed:", error.message);
                this.sessionReady = false;
                throw new AppError('Failed to establish NSE session', 502);
            } finally {
                this.sessionLock = null;
            }
        })();

        return this.sessionLock;
    }

    async fetchData(endpoint) {
        await this._initSession();
        
        // Ensure proper slash formatting
        const safeEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        const fullUrl = `https://www.nseindia.com${safeEndpoint}`;

        try {
            let result = await this._request(fullUrl, {
                "X-Requested-With": "XMLHttpRequest"
            });

            // Self-healing: Cycle session if Akamai blocks the subsequent requests
            if (result.body.trim().startsWith("<") || result.status === 401 || result.status === 403) {
                console.warn(`[NSE] Blocked/Expired (${result.status}). Reinitialising...`);
                this.sessionReady = false;
                await this._initSession();

                result = await this._request(fullUrl, {
                    "X-Requested-With": "XMLHttpRequest"
                });

                if (result.body.trim().startsWith("<") || result.status >= 400) {
                    throw new Error(`Retry failed with status ${result.status}`);
                }
            }

            if (result.status >= 400) {
                throw new Error(`NSE responded with ${result.status}`);
            }

            return JSON.parse(result.body);
        } catch (error) {
            throw new AppError(`NSE API Error: ${error.message}`, 502);
        }
    }
}

module.exports = new NseClient();