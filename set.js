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
    SESSION_ID: 'MEGA~eyJub2lzZUtleSI6eyJwcml2YXRlIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiVU82aFJoQ0R4RmYyaWFFbmtSdWw3ancrSHloMHk5WjFsTVZNYUVpaDVYST0ifSwicHVibGljIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiV3I1RXN0ZzN2emxhckIxbDZKL2NqRVVUT25EVjZ0cmg2RmJ5enhDZUt5Yz0ifX0sInBhaXJpbmdFcGhlbWVyYWxLZXlQYWlyIjp7InByaXZhdGUiOnsidHlwZSI6IkJ1ZmZlciIsImRhdGEiOiJZQ2lJL0gzTGExaXBmUFRHSW1PdS9vdUQ5TzhBS3diZTFmVy83UXFDUjJFPSJ9LCJwdWJsaWMiOnsidHlwZSI6IkJ1ZmZlciIsImRhdGEiOiJjVDJPcUg0TWg4QWZJaDF2aCtyZWNHTlRNZmZmVk1Gc29GUkp6bGsyZVQ4PSJ9fSwic2lnbmVkSWRlbnRpdHlLZXkiOnsicHJpdmF0ZSI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6Ik9CbnB0QjhGOWpVWjFvRGpvSjd0OVRVeVRHbUo4cm5YUXhzaGJtVkxvVzQ9In0sInB1YmxpYyI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6IlRxcURReitWQ0E5NHJvOE9oSlE3aDNTalhGTVdoT0d2ZGlOamtEaE1QQTA9In19LCJzaWduZWRQcmVLZXkiOnsia2V5UGFpciI6eyJwcml2YXRlIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiTUtZdHA4dVB1UWZ1dXh5aGJwWi9qUU1UdWpib2p0Rk5JZHFxcWN6Q3hIYz0ifSwicHVibGljIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoieWoydExTR3RtTEprMktwOTYwOTFsQ2hPNmZ1QlJhMVJmL21NSjlCSGp6az0ifX0sInNpZ25hdHVyZSI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6Ikhvc0RYOExxQmFPSzBaVngzU2Y1cUNRd2VieitKMVk3dSt0T2s2eWpFSWJScmxmWXNGZnUrc1FkV3YwWWRub0UrMmhXOU5jZE5DMGdLTytFMFNUbmdRPT0ifSwia2V5SWQiOjF9LCJyZWdpc3RyYXRpb25JZCI6MjAsImFkdlNlY3JldEtleSI6IlI4VnRsdVF0UDlzN0svVkhPRnNBWWNlMXUwOHlEdGwxeVBzditab3ZkY2s9IiwicHJvY2Vzc2VkSGlzdG9yeU1lc3NhZ2VzIjpbXSwibmV4dFByZUtleUlkIjo4MTMsImZpcnN0VW51cGxvYWRlZFByZUtleUlkIjo4MTMsImFjY291bnRTeW5jQ291bnRlciI6MCwiYWNjb3VudFNldHRpbmdzIjp7InVuYXJjaGl2ZUNoYXRzIjpmYWxzZX0sInJlZ2lzdGVyZWQiOmZhbHNlLCJhY2NvdW50Ijp7ImRldGFpbHMiOiJDTWFPcHRVR0VPTFQ4dE1HR0FFZ0FDZ0EiLCJhY2NvdW50U2lnbmF0dXJlS2V5IjoieXFuazgzTGJMUEludDY2MEpkbVR1dGxoNU53a3VmMThjWFVqOHdER21Fdz0iLCJhY2NvdW50U2lnbmF0dXJlIjoiVzRVbnJEdm1wd3NuTTJDdTdiT1Vyb3hLRTFjZTgwZERjVTRhUmNuaVE0UFpWMG9mU0k1S3UybXhtKy9WcWVjK3pZQUZ3UWZaeXJJTStKY3ZXK3ltQ2c9PSIsImRldmljZVNpZ25hdHVyZSI6ImhwMGVRQnRNalF0R2syVHplbzcrTCtFZ3Q4VFBReG9rbmpXR1RkUTRXT3k3QU9OQTU2Q0hsdVMzN0tza0NoZ056aGQrQmdTN0s2MGs5ZGppdDNyUGh3PT0ifSwibWUiOnsiaWQiOiIyNTQxMTI2NTg5MTY6NDZAcy53aGF0c2FwcC5uZXQiLCJsaWQiOiI1MTAzNzQ4MjI3NDk4MTo0NkBsaWQifSwic2lnbmFsSWRlbnRpdGllcyI6W3siaWRlbnRpZmllciI6eyJuYW1lIjoiNTEwMzc0ODIyNzQ5ODE6NDZAbGlkIiwiZGV2aWNlSWQiOjB9LCJpZGVudGlmaWVyS2V5Ijp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiQmNxcDVQTnkyeXp5SjdldXRDWFprN3JaWWVUY0pMbjlmSEYxSS9NQXhwaE0ifX1dLCJwbGF0Zm9ybSI6ImFuZHJvaWQiLCJyb3V0aW5nSW5mbyI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6IkNBSUlCUWdJIn0sImxhc3RBY2NvdW50U3luY1RpbWVzdGFtcCI6MTc4NjU1NDg2M30=',
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

};
