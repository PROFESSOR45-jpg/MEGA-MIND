const axios = require('axios');
const fs = require('fs-extra');
const { SESSION_CONFIG } = require('../config');

class SessionManager {
    constructor() {
        this.serverUrl = SESSION_CONFIG.SESSION_SERVER_URL;
        this.sessionId = SESSION_CONFIG.SESSION_ID;
    }

    // Fetch session from remote server
    async fetchSession(sessionId) {
        try {
            console.log(`🔍 Fetching session from server: ${this.serverUrl}`);
            
            const response = await axios.get(`${this.serverUrl}/session/${sessionId}`, {
                timeout: 10000
            });

            if (response.data && response.data.status === 'connected') {
                console.log('✅ Session found on server');
                return response.data.session;
            }
            
            throw new Error('Session not connected or expired');
        } catch (error) {
            console.error('❌ Failed to fetch session:', error.message);
            return null;
        }
    }

    // Save session locally
    async saveSession(sessionData) {
        try {
            // Decode base64 session
            const decoded = Buffer.from(sessionData, 'base64').toString('utf8');
            const creds = JSON.parse(decoded);
            
            // Save to file for Baileys
            await fs.ensureDir('./auth_info_baileys');
            await fs.writeFile('./auth_info_baileys/creds.json', JSON.stringify(creds, null, 2));
            
            // Also save as backup
            await fs.writeFile('./session.json', JSON.stringify({ session: sessionData }, null, 2));
            
            console.log('💾 Session saved locally');
            return true;
        } catch (error) {
            console.error('❌ Failed to save session:', error);
            return false;
        }
    }

    // Load existing session
    async loadSession() {
        try {
            // Check local file first
            if (await fs.pathExists('./auth_info_baileys/creds.json')) {
                console.log('📂 Loading session from local storage');
                return true;
            }

            // If SESSION_ID is set, fetch from server
            if (this.sessionId && this.sessionId.startsWith('MEGA_')) {
                const sessionData = await this.fetchSession(this.sessionId);
                if (sessionData) {
                    return await this.saveSession(sessionData);
                }
            }

            // Check backup session.json
            if (await fs.pathExists('./session.json')) {
                const backup = await fs.readJson('./session.json');
                if (backup.session) {
                    return await this.saveSession(backup.session);
                }
            }

            return false;
        } catch (error) {
            console.error('❌ Load session error:', error);
            return false;
        }
    }

    // Generate new session via server
    async generateNewSession() {
        try {
            console.log('🆕 Requesting new session from server...');
            
            const response = await axios.get(`${this.serverUrl}/generate`, {
                timeout: 10000
            });

            if (response.data && response.data.success) {
                return {
                    success: true,
                    sessionId: response.data.sessionId,
                    qrUrl: response.data.qrUrl,
                    message: response.data.message
                };
            }
            
            throw new Error('Failed to generate session');
        } catch (error) {
            console.error('❌ Generate session error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Check session status on server
    async checkServerStatus(sessionId) {
        try {
            const response = await axios.get(`${this.serverUrl}/status/${sessionId}`, {
                timeout: 5000
            });
            return response.data;
        } catch (error) {
            return { status: 'error', error: error.message };
        }
    }
}

module.exports = new SessionManager();
