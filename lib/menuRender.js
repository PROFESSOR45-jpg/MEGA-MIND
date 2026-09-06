/**
 * menuRender — builds the text for the main numbered menu and for an
 * individual category submenu, shared between the .menu command and the
 * "reply with a number" handler in index.js so they never drift apart.
 *
 * Styling goals: every section is visually separated, info rows line up
 * in a clean column, and the numbered list is easy to scan at a glance —
 * so a user can outline everything the bot can do in a few seconds.
 */

const { footer, header, SECTION } = require('./style');
const CATEGORIES = require('./menuCategories');

function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅 Good Morning';
    if (hour < 18) return '🌤️ Good Afternoon';
    return '🌙 Good Evening';
}

// Right-pads a label so the ":" lines up across every info row.
function pad(label) {
    return label.padEnd(10, ' ');
}

function renderMainMenu(config, senderName) {
    const now = new Date();
    const date = now.toLocaleDateString('en-GB');
    const time = now.toLocaleTimeString('en-GB');

    let text = `${header(config, greeting())}\n\n`;

    // ── Info block ──────────────────────────────────────────
    text += `${SECTION}\n`;
    text += `  🕵️ ${pad('User')}: ${senderName || 'there'}\n`;
    text += `  📅 ${pad('Date')}: ${date}\n`;
    text += `  ⏰ ${pad('Time')}: ${time}\n`;
    text += `  🔧 ${pad('Prefix')}: ${config.PREFIX}\n`;
    text += `  ⚙️ ${pad('Mode')}: ${config.MODE}\n`;
    text += `  📡 ${pad('Presence')}: ${config.PRESENCE_MODE}\n`;
    text += `${SECTION}\n\n`;

    // ── Menu sections, numbered and clearly separated ───────
    text += `📋 *MENU SECTIONS*\n\n`;

    CATEGORIES.forEach((cat, i) => {
        const num = String(i + 1).padStart(2, '0');
        text += `  ❒ *${num}.* ${cat.emoji}  ${cat.label}\n`;
    });

    text += `\n${SECTION}\n`;
    text += `👉 Reply with a *number* (1-${CATEGORIES.length}) to open a section\n`;
    text += `👉 Or jump straight in: ${config.PREFIX}menu <name>\n`;
    text += `${SECTION}\n\n`;
    text += footer(config);

    return text.trim();
}

function renderCategory(catDef, config, commandHandler) {
    const defs = [...new Set(commandHandler.getCategories().get(catDef.key) || [])];

    let text = `${header(config, `${catDef.emoji} ${catDef.label}`)}\n\n`;
    text += `${SECTION}\n`;

    if (!defs.length) {
        text += `  _No commands in this section yet._\n`;
    } else {
        // Align command names into a clean column so descriptions line up,
        // making the whole section easy to scan top to bottom.
        const widest = Math.max(...defs.map((d) => d.name.length));
        for (const def of defs) {
            const name = `${config.PREFIX}${def.name}`.padEnd(widest + config.PREFIX.length + 2, ' ');
            text += `  ▸ ${name}— ${def.description || ''}\n`;
        }
    }

    text += `${SECTION}\n\n`;
    text += `↩️ Send ${config.PREFIX}menu to go back to the main menu.\n\n`;
    text += footer(config);

    return text.trim();
}

module.exports = { renderMainMenu, renderCategory, CATEGORIES };
