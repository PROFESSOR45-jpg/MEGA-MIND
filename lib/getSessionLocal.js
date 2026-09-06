/**
 * Local CLI session generator — fixed with QR refresh support
 */

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const pino = require('pino');

async function generateSession() {
    console.log('\n🔐 MEGA MIND — Local Session Generator\n');
    console.log('This creates a SESSION_ID you can paste into your .env as SESSION_ID.\n');
    console.log('📱 Open WhatsApp → Settings → Linked Devices → Link a Device\n');

    const sessionPath = './temp_session';
    await fs.ensureDir(sessionPath);
    await fs.emptyDir(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: state,
        logger: pino({ level: 'silent' }),
        // Must match the fingerprint used by index.js and the session
        // server (server.js) exactly, or WhatsApp treats the bot's
        // reconnect as a different/suspicious device and revokes the
        // session right after linking (the "can't login" error).
        browser: ['MEGA MIND', 'Chrome', '120.0.0'],
        qrTimeout: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    let qrCount = 0;

    return new Promise((resolve, reject) => {
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;

            if (qr) {
                qrCount++;
                console.clear();
                console.log(`\n🔐 MEGA MIND — Local Session Generator\n`);
                console.log(`📱 Scan QR code with WhatsApp (attempt ${qrCount} — refreshes automatically):\n`);
                qrcode.generate(qr, { small: true });
                console.log('\n⏳ Waiting for scan...');
            }

            if (connection === 'open') {
                console.log('\n✅ Connected!');
                console.log(`👤 ${sock.user?.name || 'Unknown'} (${sock.user?.id})\n`);

                await new Promise((r) => setTimeout(r, 2000));

                const creds = await fs.readJson(`${sessionPath}/creds.json`);
                const sessionId = 'MEGA~' + Buffer.from(JSON.stringify(creds)).toString('base64');

                console.log('='.repeat(60));
                console.log('🎉 YOUR SESSION ID (copy everything below):');
                console.log('='.repeat(60));
                console.log('\n' + sessionId + '\n');
                console.log('='.repeat(60));
                console.log('\nAdd to your .env:\nSESSION_ID=' + sessionId + '\n');

                await fs.writeFile('session.txt', sessionId);
                await fs.remove(sessionPath);

                resolve(sessionId);
                process.exit(0);
            }

            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                if (code === DisconnectReason.loggedOut) {
                    reject(new Error('Logged out. Please try again.'));
                }
                // For other close reasons (QR expired etc), Baileys auto-retries
            }
        });
    });
}

generateSession().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
