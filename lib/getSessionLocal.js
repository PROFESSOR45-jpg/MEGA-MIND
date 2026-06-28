/**
 * Local CLI session generator — an alternative to the web-based session
 * server, for people who'd rather link via terminal QR code directly.
 * Produces the same portable "MEGA~<base64>" SESSION_ID format the bot
 * and the session server both use.
 *
 * Run with: npm run session
 */

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const pino = require('pino');

async function generateSession() {
    console.log('\n🔐 MEGA MIND — Local Session Generator\n');
    console.log('This creates a SESSION_ID you can paste into your .env as SESSION_ID.\n');

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
        browser: ['MEGA MIND Session', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    return new Promise((resolve, reject) => {
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update;

            if (qr) {
                console.log('📱 Scan this QR code with WhatsApp (Linked Devices → Link a Device):\n');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log('\n✅ Connected!');
                console.log(`👤 ${sock.user?.name || 'Unknown'} (${sock.user?.id})\n`);

                await new Promise((r) => setTimeout(r, 2000)); // let creds.json settle

                const creds = await fs.readJson(`${sessionPath}/creds.json`);
                const sessionId = 'MEGA~' + Buffer.from(JSON.stringify(creds)).toString('base64');

                console.log('='.repeat(60));
                console.log('🎉 SESSION GENERATED');
                console.log('='.repeat(60));
                console.log('\nSESSION_ID (copy this entire line):\n');
                console.log(sessionId);
                console.log('\nAdd it to your .env as:\nSESSION_ID=<the value above>\n');

                await fs.writeFile('session.txt', sessionId);
                await fs.remove(sessionPath);

                resolve(sessionId);
                process.exit(0);
            }

            if (connection === 'close') {
                reject(new Error('Connection closed before linking completed.'));
            }
        });
    });
}

generateSession().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
