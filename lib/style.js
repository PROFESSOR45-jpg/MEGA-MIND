/**
 * style.js — shared visual building blocks for chat messages so the menu,
 * repo card, info card and startup message all look like one bot.
 * header/footer/row keep the same signatures, so every caller gets the
 * new look automatically.
 */

const BAR = '━'.repeat(24);
const LINE = '┈'.repeat(28);
const SECTION = BAR;

/** Boxed title card, matching the profile picture. */
function header(config, subtitle) {
    const title = (config.BOT_TITLE || config.BOT_NAME || '').toUpperCase();
    const tagline = config.BOT_TAGLINE;

    let card = `╭${BAR}╮\n`;
    card += `┃  🧠 *${title}*\n`;
    if (tagline) card += `┃  ✦ _${tagline}_ ✦\n`;
    card += `╰${BAR}╯`;
    if (subtitle) card += `\n\n❖ *${subtitle}*`;
    return card;
}

/** Closing line used at the bottom of every branded message. */
function footer(config) {
    return `╰━━ ✦ ${config.BOT_TITLE || config.BOT_NAME} • v${config.VERSION} ✦ ━━╯`;
}

/** One labelled row, e.g. "🔧 Prefix     ➜  ." */
function row(emoji, label, value) {
    return `${emoji} ${label.padEnd(10, ' ')} ➜  ${value}`;
}

/** Opens a titled panel:  ┏━━━ ⌬ TITLE ━━━┓ */
function panelTop(title) {
    return `┏━━━ ⌬ *${title}* ━━━┓`;
}

/** Divider inside a panel. */
function panelMid() {
    return '┣' + '━'.repeat(20);
}

/** Closes a panel. */
function panelBottom() {
    return '┗' + '━'.repeat(22) + '┛';
}

module.exports = { header, footer, row, panelTop, panelMid, panelBottom, LINE, SECTION };
