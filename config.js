const fs = require('fs');
if (fs.existsSync('.env')) require('dotenv').config();

// Session Configuration
const SESSION_CONFIG = {
    // URL of your deployed session server on Render
    SESSION_SERVER_URL: process.env.SESSION_SERVER_URL || 'https://mega-mind-sessions.onrender.com',
    
    // Local session storage
    SESSION_ID: process.env.SESSION_ID,
    
    // Auto-fetch session from server if not set locally
    AUTO_FETCH_SESSION: process.env.AUTO_FETCH_SESSION === 'true' || false,
    
    // Session file path
    SESSION_FILE: './session.json'
};

// Bot Configuration
const BOT_CONFIG = {
    name: 'MEGA MIND',
    version: '3.0.0',
    prefix: '.',
    owner: process.env.OWNER_NUMBER || '',
    mode: process.env.BOT_MODE || 'public', // public/private
    antiBug: true,
    autoRead: true,
    autoStatusReact: true
};

// API Keys (fill these)
const API_KEYS = {
    openai: process.env.OPENAI_KEY || '',
    weather: process.env.WEATHER_KEY || '',
    news: process.env.NEWS_KEY || ''
};

module.exports = {
    SESSION_CONFIG,
    BOT_CONFIG,
    API_KEYS
};
