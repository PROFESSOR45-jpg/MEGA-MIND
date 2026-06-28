/**
 * Session Manager
 * Resolves WhatsApp auth creds for the bot from one of three sources,
 * in priority order:
 *   1. Already-saved local session files (./session/creds.json) — fastest path
 *   2. A pasted SESSION_ID env var in the portable "MEGA~<base64>" format
 *   3. AUTO_FETCH_SESSION=true + a session-server session id ("MM_xxxx"),
 *      fetched live from SESSION_SERVER_URL's REST API
 *
 * This is the only file that talks to the separate session-server app.
 * It only ever calls GET /session/:id — it never depends on that app's
 * internals (Socket.IO, its UI, etc).
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

const SESSION_DIR = config.SESSION_DIR;
const CREDS_PATH = path.join(SESSION_DIR, 'creds.json');

class SessionManager {
    /**
     * Decode a portable "MEGA~<base64 creds json>" string into a creds object.
     */
    decodePortableSessionId(sessionId) {
        const raw = sessionId.startsWith('MEGA~') ? sessionId.slice(5) : sessionId;
        const json = Buffer.from(raw, 'base64').toString('utf8');
        return JSON.parse(json);
    }

    /**
     * Fetch a finished session from the session server by its server-side id
     * (the "MM_xxxx" id shown by that app, NOT the portable MEGA~ string).
     */
    async fetchFromServer(serverSessionId) {
        if (!config.SESSION_SERVER_URL) {
            throw new Error('SESSION_SERVER_URL is not set, cannot auto-fetch session');
        }
        const url = `${config.SESSION_SERVER_URL.replace(/\/$/, '')}/session/${serverSessionId}`;
        const { data } = await axios.get(url, { timeout: 10000 });

        if (data.status === 'connected' && data.session) {
            return data.session; // portable MEGA~ string
        }
        if (data.status === 'pending') {
            throw new Error('Session is not linked yet on the session server. Finish linking in the browser first.');
        }
        if (data.status === 'expired') {
            throw new Error('Session expired on the session server. Generate a new one.');
        }
        throw new Error(`Session not available (status: ${data.status || 'unknown'})`);
    }

    async writeCreds(creds) {
        await fs.ensureDir(SESSION_DIR);
        await fs.writeJson(CREDS_PATH, creds, { spaces: 2 });
    }

    hasLocalSession() {
        return fs.pathExistsSync(CREDS_PATH);
    }

    /**
     * Main entry point, called once at boot before useMultiFileAuthState.
     * Returns true if a session is ready on disk (local OR freshly fetched),
     * false if the bot should fall back to showing a QR code instead.
     */
    async resolve() {
        // 1. Already have local creds — nothing to do.
        if (this.hasLocalSession()) {
            console.log('📂 Using existing local session');
            return true;
        }

        const sessionId = config.SESSION_ID;
        if (!sessionId) {
            console.log('ℹ️  No SESSION_ID set — will show a QR code to link fresh.');
            return false;
        }

        try {
            let portableId = sessionId;

            // If AUTO_FETCH_SESSION is on and the id looks like a session-server
            // id (not our own portable format), fetch the real thing first.
            if (config.AUTO_FETCH_SESSION && !sessionId.startsWith('MEGA~')) {
                console.log('🔍 Fetching session from session server...');
                portableId = await this.fetchFromServer(sessionId);
            }

            if (!portableId.startsWith('MEGA~')) {
                throw new Error(
                    'SESSION_ID is not in the expected "MEGA~..." format. ' +
                    'Paste the SESSION_ID exactly as shown by the session server, ' +
                    'or set AUTO_FETCH_SESSION=true to fetch it automatically.'
                );
            }

            const creds = this.decodePortableSessionId(portableId);
            await this.writeCreds(creds);
            console.log('✅ Session restored from SESSION_ID');
            return true;
        } catch (err) {
            console.error('❌ Failed to resolve session:', err.message);
            console.log('ℹ️  Falling back to QR code login.');
            return false;
        }
    }
}

module.exports = new SessionManager();
