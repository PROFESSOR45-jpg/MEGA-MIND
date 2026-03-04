
const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.filePath = path.join(__dirname, '..', 'database.json');
        this.data = this.load();
    }

    load() {
        try {
            if (!fs.existsSync(this.filePath)) {
                const defaultData = {
                    users: {},
                    groups: {},
                    settings: {
                        prefix: ".",
                        botName: "MEGA MIND",
                        owner: "",
                        mods: [],
                        autoread: false,
                        antidelete: true,
                        antilink: false,
                        welcome: true,
                        goodbye: true
                    },
                    stats: {
                        commands: 0,
                        messages: 0,
                        groups: 0,
                        users: 0,
                        startTime: Date.now()
                    },
                    afk: {},
                    notes: {},
                    reminders: [],
                    economy: {},
                    level: {},
                    inventory: {},
                    cooldowns: {}
                };
                this.save(defaultData);
                return defaultData;
            }
            return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        } catch (error) {
            console.error('Error loading database:', error);
            return {};
        }
    }

    save(data = this.data) {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving database:', error);
        }
    }

    // User Management
    getUser(userId) {
        if (!this.data.users[userId]) {
            this.data.users[userId] = {
                name: '',
                xp: 0,
                level: 1,
                money: 0,
                bank: 0,
                inventory: [],
                warnings: 0,
                banned: false,
                premium: false,
                registered: false,
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

    // Group Management
    getGroup(groupId) {
        if (!this.data.groups[groupId]) {
            this.data.groups[groupId] = {
                name: '',
                welcome: true,
                goodbye: true,
                antilink: false,
                antispam: false,
                mute: false,
                prefix: null,
                mods: [],
                settings: {},
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

    // AFK System
    setAFK(userId, reason) {
        this.data.afk[userId] = {
            reason: reason,
            time: Date.now()
        };
        this.save();
    }

    removeAFK(userId) {
        delete this.data.afk[userId];
        this.save();
    }

    getAFK(userId) {
        return this.data.afk[userId] || null;
    }

    // Economy System
    addMoney(userId, amount) {
        const user = this.getUser(userId);
        user.money += amount;
        this.updateUser(userId, { money: user.money });
    }

    removeMoney(userId, amount) {
        const user = this.getUser(userId);
        user.money = Math.max(0, user.money - amount);
        this.updateUser(userId, { money: user.money });
    }

    // Level System
    addXP(userId, amount) {
        const user = this.getUser(userId);
        user.xp += amount;
        const newLevel = Math.floor(Math.pow(user.xp, 1/3)) || 1;
        if (newLevel > user.level) {
            user.level = newLevel;
        }
        this.updateUser(userId, { xp: user.xp, level: user.level });
    }

    // Cooldown System
    checkCooldown(userId, command) {
        const key = `${userId}_${command}`;
        const cooldown = this.data.cooldowns[key];
        if (cooldown && Date.now() < cooldown) {
            return Math.ceil((cooldown - Date.now()) / 1000);
        }
        return 0;
    }

    setCooldown(userId, command, seconds) {
        const key = `${userId}_${command}`;
        this.data.cooldowns[key] = Date.now() + (seconds * 1000);
        this.save();
    }

    // Stats
    incrementCommand() {
        this.data.stats.commands++;
        this.save();
    }

    incrementMessage() {
        this.data.stats.messages++;
        this.save();
    }

    // Settings
    getSettings() {
        return this.data.settings;
    }

    updateSettings(updates) {
        this.data.settings = { ...this.data.settings, ...updates };
        this.save();
    }
}

module.exports = new Database();

