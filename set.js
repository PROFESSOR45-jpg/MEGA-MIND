/**
 * MEGA MIND — Manual Settings File
 * ----------------------------------------------------------------
 * Use this file if your hosting site does NOT let you add
 * Environment Variables. Just fill in the values below and
 * deploy/upload the whole project as is.
 *
 * This file must be required BEFORE config.js (it already is,
 * inside index.js) so these values get picked up automatically.
 *
 * Leave a field as '' (empty quotes) to use the default instead.
 * ----------------------------------------------------------------
 */

module.exports = {

    // ============ SESSION ============
    // Paste your session string here. It must look like: MEGA~xxxxxxxx...
    // Get one from: https://mega-mind-sessions.onrender.com
    // (or by running: node lib/getSessionLocal.js)
    SESSION_ID: 'MEGA~PASTE_YOUR_SESSION_ID_HERE',

    // Only needed if you're pasting an MM_xxxx id instead of a MEGA~ one
    AUTO_FETCH_SESSION: false,
    SESSION_SERVER_URL: '',

    // ============ OWNER ============
    // Your WhatsApp number, digits only, with country code, no + and no spaces
    // Example: Kenya number 0712345678 -> 254712345678
    OWNER_NUMBER: '254700000000',
    OWNER_NAME: 'Owner',

    // ============ BOT IDENTITY ============
    BOT_NAME: 'MEGA MIND',
    PREFIX: '.',

    // 'public'  = anyone can use the bot
    // 'private' = only the owner can use the bot
    // 'self'    = only the owner's own messages are processed
    MODE: 'public',

    // ============ OPTIONAL FEATURES ============
    ANTIBUG: true,
    ANTIBUG_DELETE: true,
    ANTIBUG_BLOCK: false,
    AUTOBLOCK: false,
    AUTO_READ_MESSAGES: false,
    STATUS_REACT: false,
    STATUS_VIEW: false,
    ANTILINK: false,
    ANTIDELETE: false,
    WELCOME: true,
    GOODBYE: true,

};
