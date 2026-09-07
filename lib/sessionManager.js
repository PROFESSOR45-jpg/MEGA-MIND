/**
 * Session Manager
 * Priority order:
 *   1. Already-saved local session files (./session/creds.json)
 *   2. A MEGA~ session string pasted directly as SESSION_ID
 *   3. AUTO_FETCH_SESSION=true — fetch from SESSION_SERVER_URL using MM_ id
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

// Hardcoded fallback — no need to set in .env
const SESSION_SERVER_URL = config.SESSION_SERVER_URL || 'https://mega-mind-sessions.onrender.com';

const SESSION_DIR = config.SESSION_DIR;
const CREDS_PATH = path.join(SESSION_DIR, 'creds.json');

class SessionManager {
    decodePortableSessionId(sessionId) {
        const raw = sessionId.startsWith('MEGA~') ? sessionId.slice(5) : sessionId;
        const json = Buffer.from(raw, 'base64').toString('utf8');
        return JSON.parse(json);
    }

    async fetchFromServer(serverSessionId) {
        const base = SESSION_SERVER_URL.replace(/\/$/, '');
        const url = `${base}/session/${serverSessionId}`;
        console.log(`🔍 Fetching session from: ${url}`);
        const { data } = await axios.get(url, { timeout: 15000 });

        if (data.status === 'connected' && data.session) {
            return data.session;
        }
        if (data.status === 'pending') {
            throw new Error('Session not linked yet. Finish linking on the session site first.');
        }
        if (data.status === 'expired') {
            throw new Error('Session expired. Generate a new one on the session site.');
        }
        throw new Error(`Session not available (status: ${data.status || 'unknown'})`);
    }

    async writeCreds(creds) {
        await fs.ensureDir(SESSION_DIR);
        await fs.writeJson(CREDS_PATH, creds, { spaces: 2 });
    }

    hasLocalSession() {
        if (!fs.pathExistsSync(CREDS_PATH)) return false;
        try {
            const stat = fs.statSync(CREDS_PATH);
            if (stat.size === 0) return false; // empty placeholder file
            const data = fs.readJsonSync(CREDS_PATH);
            // A real creds.json always has a noiseKey from Baileys' auth state.
            if (!data || !data.noiseKey) return false;
            // registered must also be true. Without this check, a session
            // captured before WhatsApp finished confirming the link gets
            // written to ./session once and then takes this fast path on every
            // later restart — never re-validated, never warned about, looping
            // forever on a credential that cannot authenticate.
            if (data.registered !== true) {
                console.log(
                    '\x1b[33m⚠️  Ignoring local session: creds.json has registered:false, ' +
                    'so it was captured before WhatsApp confirmed the device link.\x1b[0m'
                );
                return false;
            }
            return true;
        } catch {
            return false; // unreadable / invalid JSON / empty
        }
    }

    async resolve() {
        // 1. Local session already saved — use it
        if (this.hasLocalSession()) {
            console.log('📂 Using existing local session');
            return true;
        }

        const sessionId = config.SESSION_ID;
        if (!sessionId || sessionId.includes('PASTE_YOUR_SESSION_ID_HERE')) {
            throw new Error(
                'No valid SESSION_ID set. Open set.js and paste a real session string ' +
                '(starts with "MEGA~") into SESSION_ID, then restart the bot.'
            );
        }

        let portableId = sessionId.trim();

        // If it's a MM_ id from the session site, fetch the real MEGA~ string
        if (!portableId.startsWith('MEGA~')) {
            console.log('🔍 Fetching session from session server...');
            portableId = await this.fetchFromServer(portableId);
        }

        if (!portableId.startsWith('MEGA~')) {
            throw new Error('SESSION_ID must start with MEGA~ or be a MM_ server id.');
        }

        let creds;
        try {
            creds = this.decodePortableSessionId(portableId);
        } catch (err) {
            throw new Error(
                `SESSION_ID is malformed and could not be decoded (${err.message}). ` +
                'Re-copy the full string from the session generator — make sure there are ' +
                'no missing characters, line breaks, or extra quotes.'
            );
        }

        if (!creds || typeof creds !== 'object' || !creds.noiseKey) {
            throw new Error(
                'SESSION_ID decoded but does not look like a valid session (missing noiseKey). ' +
                'Generate a fresh session and try again.'
            );
        }

        if (creds.registered !== true) {
            // Hard failure, not a warning. A companion credential captured
            // before WhatsApp finished confirming the device link cannot
            // authenticate. Carrying on used to produce the worst possible
            // outcome: hasSession is true so index.js refuses to render a QR,
            // the socket then silently never connects (or gets a 401 that
            // wipes ./session and restarts the whole loop), and the only clue
            // was this yellow line scrolling past at boot. Throwing instead
            // lands in index.js' session-error handler, which prints the
            // reason and exits — and, importantly, means writeCreds below
            // never persists the broken blob to ./session where it would be
            // reused unquestioned on every later restart.
            throw new Error(
                'This SESSION_ID has registered:false — it was captured before WhatsApp finished ' +
                'confirming the device link, so it cannot log in. Generate a fresh session at ' +
                SESSION_SERVER_URL + ' and paste the new MEGA~ string into set.js (or SESSION_ID). ' +
                'Before copying it, check WhatsApp → Settings → Linked Devices and confirm the bot ' +
                'device actually appears there and stays for 30–60 seconds — not just that the ' +
                'linking page said "connected".'
            );
        }

        await this.writeCreds(creds);
        console.log('✅ Session restored from SESSION_ID');
        return true;
    }
}

module.exports = new SessionManager();
