/**
 * Lightweight JSON-file database.
 * Good enough for small/medium deployments. Everything is synchronous-ish
 * (writes happen right after mutation) so the file on disk is always close
 * to current state, which matters since this is the only persistence layer.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database.json');

function defaultData() {
    return {
        users: {},
        groups: {},
        settings: {
            prefix: '.',
            botName: 'MEGA MIND',
            owner: '',
            mods: []
        },
        stats: {
            commands: 0,
            messages: 0,
            startTime: Date.now()
        },
        afk: {},
        banned: {} // userId -> { reason, bannedAt }
    };
}

class Database {
    constructor() {
        this.data = this.load();
    }

    load() {
        try {
            if (!fs.existsSync(DB_PATH)) {
                const fresh = defaultData();
                this.data = fresh;
                this.save();
                return fresh;
            }
            const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
            // Merge with defaults so upgrades that add new top-level keys
            // don't crash on an older database.json.
            return { ...defaultData(), ...parsed };
        } catch (err) {
            console.error('Error loading database, starting fresh:', err.message);
            return defaultData();
        }
    }

    save(data = this.data) {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('Error saving database:', err.message);
        }
    }

    // ---- Users ----
    getUser(userId) {
        if (!this.data.users[userId]) {
            this.data.users[userId] = {
                name: '',
                warnings: 0,
                createdAt: Date.now()
            };
            this.save();
        }
        return this.data.users[userId];
    }

    updateUser(userId, updates) {
        this.data.users[userId] = { ...this.getUser(userId), ...updates };
        this.save();
    }

    // ---- Bans (used by AntiBug / owner .ban command) ----
    isBannedUser(userId) {
        return Boolean(this.data.banned[userId]);
    }

    banUser(userId, reason = 'No reason given') {
        this.data.banned[userId] = { reason, bannedAt: Date.now() };
        this.save();
    }

    unbanUser(userId) {
        delete this.data.banned[userId];
        this.save();
    }

    getBannedList() {
        return Object.entries(this.data.banned).map(([id, info]) => ({ id, ...info }));
    }

    // ---- Groups ----
    getGroup(groupId) {
        if (!this.data.groups[groupId]) {
            this.data.groups[groupId] = {
                name: '',
                welcome: true,
                goodbye: true,
                antilink: false,
                antidelete: false,
                mods: [],
                createdAt: Date.now()
            };
            this.save();
        }
        return this.data.groups[groupId];
    }

    updateGroup(groupId, updates) {
        this.data.groups[groupId] = { ...this.getGroup(groupId), ...updates };
        this.save();
    }

    // ---- AFK ----
    setAFK(userId, reason) {
        this.data.afk[userId] = { reason, time: Date.now() };
        this.save();
    }

    removeAFK(userId) {
        delete this.data.afk[userId];
        this.save();
    }

    getAFK(userId) {
        return this.data.afk[userId] || null;
    }

    // ---- Cooldowns (kept in memory, not persisted — short-lived by nature) ----
    checkCooldown(userId, command) {
        this._cooldowns = this._cooldowns || new Map();
        const key = `${userId}_${command}`;
        const expiresAt = this._cooldowns.get(key);
        if (expiresAt && Date.now() < expiresAt) {
            return Math.ceil((expiresAt - Date.now()) / 1000);
        }
        return 0;
    }

    setCooldown(userId, command, seconds) {
        this._cooldowns = this._cooldowns || new Map();
        this._cooldowns.set(`${userId}_${command}`, Date.now() + seconds * 1000);
    }

    // ---- Stats ----
    incrementCommand() {
        this.data.stats.commands++;
        this.save();
    }

    incrementMessage() {
        this.data.stats.messages++;
        this.save();
    }
}

module.exports = new Database();
