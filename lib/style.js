/**
 * style.js — shared visual building blocks for chat messages so the menu,
 * repo card, and startup message all look like they belong to the same bot
 * instead of three differently-formatted text blobs. The header mirrors the
 * boxed title/tagline look of the bot's own profile picture card.
 */

const LINE = '┈'.repeat(28);
const SECTION = '▬'.repeat(28);

/**
 * A consistent header used at the top of every branded message, styled
 * like a rounded card: a boxed title + tagline (matching the profile
 * picture), then an optional subtitle line for the current message.
 */
function header(config, subtitle) {
    const title = config.BOT_TITLE || config.BOT_NAME;
    const tagline = config.BOT_TAGLINE;
    const width = Math.max(title.length, tagline.length) + 4;

    let card = `╭${'─'.repeat(width)}╮\n`;
    card += `│  🧠 *${title.toUpperCase()}*\n`;
    if (tagline) card += `│  _${tagline}_\n`;
    card += `╰${'─'.repeat(width)}╯`;
    if (subtitle) card += `\n✦ ${subtitle}`;
    return card;
}

/**
 * A consistent footer used at the bottom of every branded message.
 */
function footer(config) {
    return `${LINE}\n✦ ${config.BOT_TITLE || config.BOT_NAME} • v${config.VERSION}`;
}

/**
 * One labelled row, e.g. "🔧 Prefix     ▸  ."
 */
function row(emoji, label, value) {
    return `${emoji} ${label.padEnd(10, ' ')} ▸  ${value}`;
}

module.exports = { header, footer, row, LINE, SECTION };
