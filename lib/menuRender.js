/**
 * menuRender — builds the text for the main numbered menu and for an
 * individual category submenu, shared between the .menu command and the
 * "reply with a number" handler in index.js so they never drift apart.
 */

const { header, footer, panelTop, panelMid, panelBottom } = require('./style');
const CATEGORIES = require('./menuCategories');

const KEYCAPS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

function keycap(n) {
    return String(n).split('').map((d) => KEYCAPS[Number(d)]).join('');
}

function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅 Good Morning';
    if (hour < 18) return '🌤️ Good Afternoon';
    return '🌙 Good Evening';
}

function pad(label) {
    return label.padEnd(9, ' ');
}

function uptimeText() {
    const s = Math.floor(process.uptime());
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${m}m`;
    return `${m}m ${s % 60}s`;
}

function commandsIn(catKey, commandHandler) {
    if (!commandHandler) return [];
    return [...new Set(commandHandler.getCategories().get(catKey) || [])];
}

function renderMainMenu(config, senderName, commandHandler) {
    const now = new Date();
    const date = now.toLocaleDateString('en-GB');
    const time = now.toLocaleTimeString('en-GB');

    let text = `${header(config)}\n\n`;
    text += `${greeting()}, *${senderName || 'there'}*! 👋\n\n`;

    text += `${panelTop('SYSTEM')}\n`;
    text += `┃ 📅 ${pad('Date')}➜ ${date}\n`;
    text += `┃ ⏰ ${pad('Time')}➜ ${time}\n`;
    text += `┃ 🔧 ${pad('Prefix')}➜ ${config.PREFIX}\n`;
    text += `┃ ⚙️ ${pad('Mode')}➜ ${config.MODE}\n`;
    text += `┃ ⏱️ ${pad('Uptime')}➜ ${uptimeText()}\n`;
    text += `${panelBottom()}\n\n`;

    text += `${panelTop('MENU SECTIONS')}\n`;
    CATEGORIES.forEach((cat, i) => {
        const count = commandsIn(cat.key, commandHandler).length;
        const badge = commandHandler ? `  ⟡ _${count}_` : '';
        text += `┃ ${keycap(i + 1)} ${cat.emoji} *${cat.label}*${badge}\n`;
    });
    text += `${panelBottom()}\n\n`;

    text += `💡 Reply with a *number* (1-${CATEGORIES.length}) to open a section\n`;
    text += `💡 Or type *${config.PREFIX}menu <name>*  e.g. ${config.PREFIX}menu ai\n\n`;
    text += footer(config);

    return text.trim();
}

function renderCategory(catDef, config, commandHandler) {
    const defs = commandsIn(catDef.key, commandHandler);
    const bullet = catDef.bullet || '▸';

    let text = `${header(config)}\n\n`;
    text += `${panelTop(`${catDef.emoji} ${catDef.label}`)}\n`;
    if (catDef.tagline) text += `┃ _${catDef.tagline}_\n`;
    text += `┃ 📦 ${defs.length} command${defs.length === 1 ? '' : 's'}\n`;
    text += `${panelMid()}\n`;

    if (!defs.length) {
        text += `┃ _No commands in this section yet._\n`;
    } else {
        defs.forEach((def, i) => {
            const badges =
                (def.ownerOnly ? ' 👑' : '') +
                (def.adminOnly ? ' 🛡️' : '') +
                (def.groupOnly ? ' 👥' : '');
            const aliases = def.aliases && def.aliases.length
                ? `  _(${def.aliases.slice(0, 2).map((a) => config.PREFIX + a).join(', ')})_`
                : '';
            text += `┃ ${bullet} *${config.PREFIX}${def.name}*${badges}${aliases}\n`;
            if (def.description) text += `┃     ╰ _${def.description}_\n`;
            if (i < defs.length - 1) text += `┃\n`;
        });
    }

    text += `${panelBottom()}\n\n`;
    if (defs.some((d) => d.ownerOnly || d.adminOnly || d.groupOnly)) {
        text += `🔑 👑 owner • 🛡️ admin • 👥 groups only\n`;
    }
    text += `↩️ Reply *0* for the main menu, or another number to switch section\n\n`;
    text += footer(config);

    return text.trim();
}

module.exports = { renderMainMenu, renderCategory, CATEGORIES };
