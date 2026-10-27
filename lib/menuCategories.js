/**
 * menuCategories — display metadata for the numbered main menu (.menu).
 * `key` must match the `category` field used in command definitions so the
 * submenu can pull the right command list from CommandHandler.getCategories().
 * `bullet` is the marker shown before each command in that submenu.
 */

module.exports = [
    { key: 'general',    emoji: '🌍', label: 'GENERAL MENU',  bullet: '✨', tagline: 'Everyday essentials' },
    { key: 'ai',         emoji: '🤖', label: 'AI MENU',       bullet: '🧠', tagline: 'Chat, ask and create with AI' },
    { key: 'media',      emoji: '🎬', label: 'MEDIA MENU',    bullet: '🎞️', tagline: 'Stickers and media tools' },
    { key: 'downloader', emoji: '📥', label: 'DOWNLOADER MENU', bullet: '⬇️', tagline: 'Songs, videos and social media downloads' },
    { key: 'group',      emoji: '👥', label: 'GROUP MENU',    bullet: '🛠️', tagline: 'Manage and moderate your groups' },
    { key: 'protection', emoji: '🛡️', label: 'SETTINGS MENU', bullet: '⚙️', tagline: 'Protection and bot behaviour' },
    { key: 'utility',    emoji: '🧰', label: 'UTILITY MENU',  bullet: '🔹', tagline: 'Handy everyday tools' },
    { key: 'owner',      emoji: '👑', label: 'OWNER MENU',    bullet: '🔱', tagline: 'Owner-only controls' }
];
