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

function parseMessage(m, prefix, ownJid) {
    const text = getText(m);
    const isGroup = m.key.remoteJid?.endsWith('@g.us');

    // Sender resolution:
    //  - Group message: m.key.participant is always the real sender's JID,
    //    correct even for the bot's own outgoing messages (fromMe: true).
    //  - DM received from someone else: remoteJid is that person — correct.
    //  - DM sent by the linked account itself (fromMe: true, no participant):
    //    remoteJid here is the OTHER side of the chat, NOT the sender —
    //    using it as-is misidentified the owner's own commands (sent in any
    //    normal chat, not just a self-chat) as coming from whoever they
    //    were talking to, silently blocking them under MODE=private/self.
    //    ownJid (the bot's own id, i.e. the owner) is the correct sender here.
    let sender;
    if (m.key.participant) {
        sender = m.key.participant;
    } else if (m.key.fromMe && ownJid) {
        sender = ownJid;
    } else {
        sender = m.key.remoteJid;
    }

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
