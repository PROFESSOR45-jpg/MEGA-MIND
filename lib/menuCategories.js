/**
 * menuCategories — display metadata for the numbered main menu (.menu).
 * `key` must match the `category` field used in command definitions so the
 * submenu can pull the right command list from CommandHandler.getCategories().
 */

module.exports = [
    { key: 'general', emoji: '🌍', label: 'GENERAL MENU' },
    { key: 'ai', emoji: '🤖', label: 'AI MENU' },
    { key: 'media', emoji: '🎬', label: 'MEDIA MENU' },
    { key: 'group', emoji: '👨‍👨‍👦‍👦', label: 'GROUP MENU' },
    { key: 'protection', emoji: '🛡️', label: 'SETTINGS MENU' },
    { key: 'utility', emoji: '🧰', label: 'UTILITY MENU' },
    { key: 'owner', emoji: '👑', label: 'OWNER MENU' }
];
