/**
 * MEGA MIND — Manual Settings File
 * ----------------------------------------------------------------
 * 👉 THIS IS THE ONLY FILE YOU NEED TO EDIT BEFORE DEPLOYING. 👈
 *
 * All bot settings live here now — identity, owner info, behavior,
 * protection features, presence, AI, and your session. The .env file is
 * no longer required: if it exists with values filled in, those values
 * win (so hosts that support Environment Variables still work normally),
 * but for everyone else, just fill in the fields below and deploy.
 *
 * Leave a field as '' (empty quotes) to use the built-in default instead.
 * ----------------------------------------------------------------
 */

module.exports = {

    // ============ SESSION ============
    // Paste your full session string here (starts with "MEGA~"), OR a
    // server id (starts with "MM_") if AUTO_FETCH_SESSION is true below.
    //
    // ⚠️ This string is long (a few KB) and is your account's login
    // credential — treat it like a password, and paste it as ONE
    // continuous string with no line breaks in the middle. Some hosting
    // panel editors auto-wrap long lines when you paste, which can insert
    // a real line break into the middle of it. If that happens here,
    // Node will fail to load this file with a clear syntax error at
    // startup (not a silent failure) — if you hit that, either re-paste
    // carefully in a plain text editor first, or fall back to
    // session_id.txt in this same folder, which strips whitespace
    // automatically and can't have JS syntax errors.
    SESSION_ID: 'MEGA~eyJ',
    AUTO_FETCH_SESSION: false,
    SESSION_SERVER_URL: '',

    // ============ OWNER ============
    // Your WhatsApp number, digits only, with country code, no + and no spaces
    // Example: Kenya number 0712345678 -> 254712345678
    OWNER_NUMBER: '254112658916',
    OWNER_NAME: 'Professor',

    // ============ BOT IDENTITY ============
    BOT_NAME: 'MEGA MIND',
    PREFIX: ',',

    // 'public'  = anyone can use the bot
    // 'private' = only the owner can use the bot
    // 'self'    = only the owner's own messages are processed
    MODE: 'private',

    // ============ BRANDING ============
    // Used as the bot's WhatsApp profile picture and the image attached to
    // .menu / .repo / the startup message. Local assets/profile.png is
    // used by default; set BOT_IMAGE_URL only if you want to override it
    // with a hosted image instead.
    BOT_IMAGE_URL: '',
    REPO_URL: 'https://github.com/PROFESSOR45-jpg/MEGA-MIND',
    // Title/tagline shown in the boxed header of every branded message —
    // match the text on your profile picture, e.g. PROFESSOR TECH / MEGA-MIND BOT
    BOT_TITLE: 'PROFESSOR TECH',
    BOT_TAGLINE: 'MEGA-MIND BOT',

    // ============ PROTECTION / AUTO-FEATURES ============
    ANTIBUG: true,
    ANTIBUG_DELETE: true,
    ANTIBUG_BLOCK: false,

    AUTOBLOCK: false,
    AUTO_READ_MESSAGES: false,

    STATUS_REACT: false,
    STATUS_VIEW: true,
    // Comma separated, no spaces needed around the commas
    STATUS_REACTION_EMOJIS: '🔥,❤️,😍,👍,💯',

    COMMAND_STATUS_REACT: true,

    ANTILINK: false,
    ANTIDELETE: false,
    WELCOME: true,
    GOODBYE: true,

    // ============ PRESENCE ============
    // typing | recording | both | online | offline | off
    // Editable at runtime with .presence <mode>
    PRESENCE_MODE: 'offline',

    // ============ AI (.ai / .ask / .gpt) ============
    // Any OpenAI-compatible endpoint works — change AI_BASE_URL for other
    // providers (Groq shown below as the default; swap in your own key).
    // ⚠️ Put YOUR OWN key here. The previous key baked into this template
    // was a live, working credential — anyone with a copy of this file
    // could spend your quota. It has been removed; generate a new one at
    // https://console.groq.com and paste it below (or set AI_API_KEY as
    // an environment variable instead of editing this file).
    AI_API_KEY: '',
    AI_BASE_URL: 'https://api.groq.com/openai/v1',
    AI_MODEL: 'llama-3.3-70b-versatile',

    // ============ MISC ============
    COMMAND_COOLDOWN_SECONDS: 3,
    // Verbose console logging for every incoming message — helps diagnose
    // "commands don't respond" issues. Set to false once everything works.
    DEBUG: true,

    // ============ DOWNLOADER (mega-dl service) ============
    // Point the bot at a mega-dl instance so downloads run on a host that has
    // yt-dlp + ffmpeg. Leave DL_API_URL empty to fall back to a local yt-dlp.
    // DOWNLOAD_API_URL / DOWNLOAD_API_SECRET are accepted as aliases.
    // The URL is the service root — no /download on the end.
    DL_API_URL: '',
    DL_API_SECRET: '',

    // Cookies (Netscape cookies.txt). Without them YouTube and Instagram
    // block the server's IP. Either paste the file as base64, or point at it.
    YTDLP_COOKIES_B64: '',
    YTDLP_COOKIES_FILE: '',

    // Download limits.
    MAX_DOWNLOAD_MB: 100,
    YTDLP_MAX_HEIGHT: 720,
    DL_MAX_CONCURRENT: 2,
    DL_TIMEOUT_SECONDS: 180,

};
