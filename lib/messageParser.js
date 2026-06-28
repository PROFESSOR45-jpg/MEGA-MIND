/**
 * parseMessage — normalizes a raw Baileys message object into the handful
 * of fields commands actually need. Baileys messages can carry the same
 * logical content (e.g. "text") under many different keys depending on
 * message type, so this is the one place that complexity lives.
 */

function getText(m) {
    const msg = m.message;
    if (!msg) return '';
    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.buttonsResponseMessage?.selectedButtonId ||
        msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
        ''
    );
}

function getQuoted(m) {
    const ctx = m.message?.extendedTextMessage?.contextInfo;
    if (!ctx?.quotedMessage) return null;
    return {
        message: ctx.quotedMessage,
        key: {
            remoteJid: m.key.remoteJid,
            id: ctx.stanzaId,
            participant: ctx.participant,
            fromMe: ctx.participant ? false : undefined
        }
    };
}

function getMentions(m) {
    return m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

function parseMessage(m, prefix) {
    const text = getText(m);
    const isGroup = m.key.remoteJid?.endsWith('@g.us');
    const sender = m.key.participant || m.key.remoteJid;

    let command = null;
    let args = [];
    let isCommand = false;

    if (text.startsWith(prefix)) {
        const body = text.slice(prefix.length).trim();
        const parts = body.split(/\s+/);
        command = (parts.shift() || '').toLowerCase();
        args = parts;
        isCommand = Boolean(command);
    }

    return {
        raw: m,
        text,
        command,
        args,
        argsText: args.join(' '),
        isCommand,
        isGroup,
        sender,
        jid: m.key.remoteJid,
        quoted: getQuoted(m),
        mentions: getMentions(m)
    };
}

module.exports = { parseMessage, getText, getQuoted, getMentions };
