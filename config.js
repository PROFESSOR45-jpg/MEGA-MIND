/**
 * MEGA MIND — unified configuration
 * Single source of truth. Everything reads from here; nothing else in this
 * repo should define its own config object.
 *
 * Set values via environment variables (.env locally, or your host's env
 * var settings). Defaults below are safe fallbacks, not secrets.
 */

const fs = require('fs');
if (fs.existsSync('.env')) require('dotenv').config();
const path = require('path');

// Load set.js (manual settings file) if present. Any value set there fills
// in for that field ONLY if the matching environment variable is not
// already set — so env vars on hosts that support them still win.
// Wrapped in try/catch: a typo or a broken paste in set.js should never
// crash the whole bot with an unreadable stack trace.
const setFilePath = path.join(__dirname, 'set.js');
if (fs.existsSync(setFilePath)) {
    try {
        const manual = require(setFilePath);
        for (const [key, value] of Object.entries(manual)) {
            if (process.env[key] === undefined || process.env[key] === '') {
                if (typeof value === 'boolean') {
                    process.env[key] = value ? 'true' : 'false';
                } else if (value !== '' && value !== undefined && value !== null) {
                    process.env[key] = String(value);
                }
            }
        }
    } catch (err) {
        console.error('\x1b[31m❌ set.js has a syntax error and could not be loaded:\x1b[0m');
        console.error('   ' + err.message);
        console.error('\x1b[33m👉 If you pasted a long SESSION_ID into set.js, your editor may have\x1b[0m');
        console.error('\x1b[33m   inserted a line break into it. Use session_id.txt instead — put the\x1b[0m');
        console.error('\x1b[33m   whole session string there with nothing else in the file.\x1b[0m');
    }
}

// SESSION_ID: prefer a plain text file over set.js. A .txt file can't have
// JS syntax errors, and we strip all whitespace/newlines when reading it,
// so it survives editors that auto-wrap long lines.
const sessionTxtPath = path.join(__dirname, 'session_id.txt');
if (fs.existsSync(sessionTxtPath)) {
    try {
        const raw = fs.readFileSync(sessionTxtPath, 'utf8').replace(/\s+/g, '');
        if (raw && !raw.includes('PASTE_YOUR_SESSION_ID_HERE')) {
            process.env.SESSION_ID = raw;
        }
    } catch (err) {
        console.error('\x1b[31m❌ Could not read session_id.txt:\x1b[0m', err.message);
    }
}

function bool(value, fallback) {
    if (value === undefined || value === '') return fallback;
    return value === 'true' || value === '1';
}

function list(value, fallback) {
    if (!value) return fallback;
    return value.split(',').map((s) => s.trim()).filter(Boolean);
}

const config = {
    // ---- Identity ----
    BOT_NAME: process.env.BOT_NAME || 'MEGA MIND',
    VERSION: '4.0.0',
    OWNER_NAME: process.env.OWNER_NAME || 'Owner',
    // Digits only, no + — e.g. 254712345678
    OWNER_NUMBER: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),

    // ---- Session ----
    // Either paste a SESSION_ID directly (format: "MEGA~<base64>"), or set
    // AUTO_FETCH_SESSION=true with a SESSION_ID that is the *session server's*
    // session id (format: "MM_xxxx") so the bot pulls the real one over HTTP.
    SESSION_ID: process.env.SESSION_ID || '',
    SESSION_SERVER_URL: process.env.SESSION_SERVER_URL || '',
    AUTO_FETCH_SESSION: bool(process.env.AUTO_FETCH_SESSION, false),
    SESSION_DIR: process.env.SESSION_DIR || './session',

    // ---- Behavior ----
    PREFIX: process.env.PREFIX || '.',
    // 'public'  = anyone can use the bot
    // 'private' = only the owner can use the bot (others auto-blocked if AUTOBLOCK is on)
    // 'self'    = only the owner's own messages are processed (no auto-block)
    MODE: process.env.MODE || 'public',

    // ---- Protection / auto-features ----
    ANTIBUG: bool(process.env.ANTIBUG, true),          // drop malformed/oversized incoming payloads
    ANTIBUG_DELETE: bool(process.env.ANTIBUG_DELETE, true),
    ANTIBUG_BLOCK: bool(process.env.ANTIBUG_BLOCK, false),
    BUG_MAX_LENGTH: parseInt(process.env.BUG_MAX_LENGTH || '8000', 10),

    AUTOBLOCK: bool(process.env.AUTOBLOCK, false),     // auto-block non-owner DMs when MODE=private
    AUTO_READ_MESSAGES: bool(process.env.AUTO_READ_MESSAGES, false),

    STATUS_REACT: bool(process.env.STATUS_REACT, false),
    STATUS_VIEW: bool(process.env.STATUS_VIEW, false),
    STATUS_REACTION_EMOJIS: list(process.env.STATUS_REACTION_EMOJIS, ['🔥', '❤️', '😍', '👍', '💯']),

    COMMAND_STATUS_REACT: bool(process.env.COMMAND_STATUS_REACT, true),

    ANTILINK: bool(process.env.ANTILINK, false),       // default per-group; can be toggled per-group at runtime
    ANTIDELETE: bool(process.env.ANTIDELETE, false),
    WELCOME: bool(process.env.WELCOME, true),
    GOODBYE: bool(process.env.GOODBYE, true),

    // ---- Misc ----
    COMMAND_COOLDOWN_SECONDS: parseInt(process.env.COMMAND_COOLDOWN_SECONDS || '3', 10),

    MESSAGES: {
        OWNER_ONLY: '👑 This command is for the bot owner only.',
        ADMIN_ONLY: '👮 This command is for group admins only.',
        GROUP_ONLY: '👥 This command only works in groups.',
        BOT_NOT_ADMIN: '⚠️ I need to be an admin in this group for that.',
        BANNED_USER: '🚫 You are banned from using this bot.',
        BUG_BLOCKED: '🛡️ Suspicious message blocked.',
        BUG_SENDER_BLOCKED: '🚫 You have been blocked for sending malformed/abusive content.'
    }
};

module.exports = config;
