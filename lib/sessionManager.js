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
        return fs.pathExistsSync(CREDS_PATH);
    }

    async resolve() {
        // 1. Local session already saved — use it
        if (this.hasLocalSession()) {
            console.log('📂 Using existing local session');
            return true;
        }

        const sessionId = config.SESSION_ID;
        if (!sessionId) {
            console.log('ℹ️  No SESSION_ID set — showing QR code.');
            return false;
        }

        try {
            let portableId = sessionId;

            // If it's a MM_ id from the session site, fetch the real MEGA~ string
            if (!sessionId.startsWith('MEGA~')) {
                console.log('🔍 Fetching session from session server...');
                portableId = await this.fetchFromServer(sessionId);
            }

            if (!portableId.startsWith('MEGA~')) {
                throw new Error('SESSION_ID must start with MEGA~ or be a MM_ server id.');
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
