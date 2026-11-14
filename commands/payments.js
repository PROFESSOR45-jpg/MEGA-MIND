/**
 * Payments commands — save STK-push links and trigger them from WhatsApp.
 *
 *   .addpush <name> <url> [get|json|form] [status=<url with {id}>] [body=<template>]
 *   .addpush <name> https://<site>/h/<host>        (payment PAGE link, set up automatically)
 *   .push <name> <phone> <amount> [customer name]
 *   .pushlist
 *   .delpush <name>
 *
 * Payment page links: https://<site>/h/<host> is expanded to
 *   push   POST https://<site>/api/pay   {"name","phone","amount","host"}
 *   status GET  https://<site>/api/status/{id}   ({id} = checkout id from the pay reply)
 * The customer name is the optional text after the amount ("Customer" by default).
 * A /h/<host> link given together with get|json|form or body= is still treated as a
 * normal API link, exactly as before.
 *
 * Everything is OWNER ONLY and refused in groups.
 *
 * Placeholders usable in the url, status url and body template:
 *   {phone}  2547XXXXXXXX      {phone0}  07XXXXXXXX
 *   {amount} whole KES         {ref}     short unique reference
 *   {id}     (status url only) id the push endpoint returned
 *
 * Secrets (API keys, tokens) do NOT belong in the chat or in the link. Put them
 * in set.js / environment variables instead:
 *   PUSH_HEADERS           JSON, sent with every push, e.g.
 *                          {"Authorization":"Bearer xxxx"}
 *   PUSH_HEADERS_<NAME>    same, but only for the saved link <NAME> (upper-case)
 *   PUSH_MAX_AMOUNT        refuse bigger amounts          (default 10000)
 *   PUSH_MAX_PER_HOUR      pushes per phone number / hour (default 3)
 *   PUSH_POLL_SECONDS      how long to wait for the result (default 60)
 */

const axios = require('axios');
const db = require('../lib/database');

const NAME_RE = /^[a-z0-9_-]{1,20}$/;
const MAX_BODY = 600; // chars kept from a server reply

const num = (v, d) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : d;
};
const MAX_AMOUNT = () => num(process.env.PUSH_MAX_AMOUNT, 10000);
const MAX_PER_HOUR = () => num(process.env.PUSH_MAX_PER_HOUR, 3);
const POLL_SECONDS = () => num(process.env.PUSH_POLL_SECONDS, 60);

// ---------------------------------------------------------------- storage

function links() {
    if (!db.data.pushLinks) db.data.pushLinks = {};
    return db.data.pushLinks;
}

// ---------------------------------------------------------------- validation

// Only http(s), and no local/private hosts (the bot should not be pointed at
// its own network). PUSH_ALLOW_PRIVATE=true is for local testing only.
function checkUrl(raw) {
    let u;
    try { u = new URL(raw); } catch { return 'That is not a valid link.'; }
    if (!['https:', 'http:'].includes(u.protocol)) return 'The link must start with https://';
    if (u.protocol === 'http:' && process.env.PUSH_ALLOW_PRIVATE !== 'true') {
        return 'Use an https:// link — payment details should not travel unencrypted.';
    }
    if (process.env.PUSH_ALLOW_PRIVATE === 'true') return null;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return 'That host is not allowed.';
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return 'That host is not allowed.';
    if (h === '::1' || h.startsWith('[')) return 'That host is not allowed.';
    return null;
}

// 0712345678 / 712345678 / +254712345678 / 254112345678 -> 254XXXXXXXXX
function normalizePhone(input) {
    let d = String(input || '').replace(/\D/g, '');
    if (d.startsWith('254')) d = d.slice(3);
    else if (d.startsWith('0')) d = d.slice(1);
    if (!/^[17]\d{8}$/.test(d)) return null;
    return `254${d}`;
}

function parseAmount(input) {
    if (!/^\d{1,7}$/.test(String(input || '').trim())) return null;
    const n = parseInt(input, 10);
    return n >= 1 && n <= MAX_AMOUNT() ? n : null;
}

const maskPhone = (p) => `${p.slice(0, 5)}***${p.slice(-3)}`;

// Shown in replies wherever a sample number would go, instead of a real-looking one.
const EXAMPLE_PHONE = '07********';

// https://<site>/h/<host>  ->  { origin, host }, or null when it is not a page link.
function parsePageLink(raw) {
    if (/[{}]/.test(raw)) return null; // templates are API links
    let u;
    try { u = new URL(raw); } catch { return null; }
    const m = u.pathname.match(/^\/h\/([A-Za-z0-9._~-]{1,64})\/?$/);
    return m ? { origin: u.origin, host: m[1] } : null;
}

// Customer name for page links: letters, digits, space . ' - only; max 40 chars.
function cleanName(input) {
    const s = String(input || '').replace(/[^\p{L}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return s || 'Customer';
}

// Show where a link points without leaking tokens that may sit in the query.
function safeLabel(raw) {
    try {
        const u = new URL(raw);
        return `${u.origin}${u.pathname}${u.search ? '?…' : ''}`;
    } catch { return '(invalid)'; }
}

// ---------------------------------------------------------------- templating

function fill(tpl, vars, encode) {
    return String(tpl).replace(/\{(phone0|phone|amount|ref|id)\}/g, (_, k) => {
        const v = vars[k] === undefined ? '' : String(vars[k]);
        return encode ? encodeURIComponent(v) : v;
    });
}

const DEFAULT_BODY = {
    json: '{"phone":"{phone}","amount":{amount},"reference":"{ref}"}',
    form: 'phone={phone}&amount={amount}&reference={ref}'
};

function pickMode(url, requested) {
    if (requested) return requested;
    return /\{(phone0|phone|amount|ref)\}/.test(url) ? 'get' : 'json';
}

// Split ".addpush" text after the link into mode / status= / body=.
function parseOptions(rest) {
    let text = String(rest || '').trim();
    const opts = { mode: null, status: null, body: null };

    const bodyAt = text.search(/(^|\s)body=/i);
    if (bodyAt !== -1) {
        opts.body = text.slice(bodyAt).replace(/^\s*body=/i, '').trim();
        text = text.slice(0, bodyAt).trim();
    }
    const st = text.match(/(^|\s)status=(\S+)/i);
    if (st) {
        opts.status = st[2];
        text = text.replace(st[0], ' ').trim();
    }
    const mode = text.match(/\b(get|json|form)\b/i);
    if (mode) opts.mode = mode[1].toLowerCase();
    return opts;
}

// ---------------------------------------------------------------- headers

function extraHeaders(name) {
    const out = {};
    for (const key of ['PUSH_HEADERS', `PUSH_HEADERS_${name.toUpperCase().replace(/-/g, '_')}`]) {
        const raw = process.env[key];
        if (!raw) continue;
        try { Object.assign(out, JSON.parse(raw)); } catch {
            console.error(`⚠️  ${key} is not valid JSON — ignored.`);
        }
    }
    return out;
}

// ---------------------------------------------------------------- reading replies

const MESSAGE_KEYS = [
    'CustomerMessage', 'customer_message', 'ResponseDescription', 'ResultDesc',
    'message', 'msg', 'detail', 'description', 'error_description', 'errorMessage', 'error'
];
const ID_KEYS = [
    'CheckoutRequestID', 'checkout_request_id', 'CheckoutRequestId', 'MerchantRequestID',
    'transaction_id', 'transactionId', 'tracking_id', 'invoice_id', 'request_id', 'reference', 'id'
];

// Find the first value for any of `keys`, looking up to 3 levels deep.
function dig(obj, keys, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 3) return undefined;
    for (const k of keys) {
        const hit = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase());
        if (hit !== undefined && obj[hit] !== null && obj[hit] !== '' && typeof obj[hit] !== 'object') return obj[hit];
    }
    for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') {
            const r = dig(v, keys, depth + 1);
            if (r !== undefined) return r;
        }
    }
    return undefined;
}

const looksLikeHtml = (s) => typeof s === 'string' && /^\s*<(!doctype|html|head|body)/i.test(s);

function plain(s) {
    return String(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Checkout id from a payment-page pay reply: any "ws_CO_..." value wherever it sits,
// then the usual field names, then the generic list used by other links.
function findCheckoutId(data, depth = 0) {
    if (typeof data === 'string') return /^ws_CO_[\w-]+$/i.test(data) ? data : undefined;
    if (!data || typeof data !== 'object' || depth > 4) return undefined;
    for (const v of Object.values(data)) {
        const r = findCheckoutId(v, depth + 1);
        if (r !== undefined) return r;
    }
    return undefined;
}

function pageId(data) {
    return findCheckoutId(data)
        ?? dig(data, ['checkoutRequestID', 'checkout_request_id', 'checkoutId', 'checkout_id'])
        ?? dig(data, ID_KEYS);
}

// Did the server accept the push? ('ok' | 'rejected' | 'html')
// `strict` (payment-page links only) also treats {"ok":false} and a filled "error" as a rejection.
function judgePush(resp, strict = false) {
    if (looksLikeHtml(resp.data)) return { verdict: 'html', text: plain(resp.data).slice(0, 200) };
    const d = resp.data;
    let text = typeof d === 'string' ? d.trim().slice(0, MAX_BODY) : String(dig(d, MESSAGE_KEYS) ?? '').slice(0, MAX_BODY);
    if (!text && d && typeof d === 'object') text = JSON.stringify(d).slice(0, MAX_BODY);

    let ok = resp.status >= 200 && resp.status < 300;
    if (d && typeof d === 'object') {
        const rc = dig(d, ['ResponseCode']);
        if (rc !== undefined && String(rc) !== '0') ok = false;
        const success = dig(d, ['success']);
        if (success === false || String(success).toLowerCase() === 'false') ok = false;
        const status = String(dig(d, ['status', 'state']) ?? '');
        if (/^(fail|error|rejected|declin)/i.test(status)) ok = false;
        if (dig(d, ['errorCode', 'error_code']) !== undefined) ok = false;
        if (strict) {
            if (dig(d, ['ok']) === false) ok = false;
            const err = dig(d, ['error']);
            if (err !== undefined && err !== false) ok = false;
        }
    }
    return { verdict: ok ? 'ok' : 'rejected', text };
}

// Final outcome from a status reply: 'success' | 'failed' | 'pending'
function classify(data) {
    if (!data || typeof data !== 'object') return { state: 'pending', text: '' };
    const text = String(dig(data, ['ResultDesc', 'message', 'status_message', 'description', 'status', 'state', 'payment_status']) ?? '');
    const receipt = dig(data, ['MpesaReceiptNumber', 'mpesa_receipt', 'receipt', 'receipt_number', 'TransactionID']);
    const code = dig(data, ['ResultCode']);
    if (code !== undefined) {
        return { state: String(code) === '0' ? 'success' : 'failed', text, receipt };
    }
    const flag = String(dig(data, ['status', 'state', 'payment_status', 'transaction_status']) ?? '');
    if (/success|paid|complete|approved/i.test(flag)) return { state: 'success', text: text || flag, receipt };
    if (/fail|cancel|reject|declin|insufficient|timeout|timed.?out|expired|wrong|error/i.test(flag)) {
        return { state: 'failed', text: text || flag, receipt };
    }
    return { state: 'pending', text, receipt };
}

// classify() plus two extra shapes common on custom payment sites (page links only).
function classifyPage(data) {
    const r = classify(data);
    if (r.state !== 'pending' || !data || typeof data !== 'object') return r;
    const rc = dig(data, ['result_code']);
    if (rc !== undefined) return { ...r, state: String(rc) === '0' ? 'success' : 'failed' };
    const paid = dig(data, ['paid', 'is_paid', 'isPaid']);
    if (paid === true || String(paid).toLowerCase() === 'true') return { ...r, state: 'success' };
    return r;
}

// ---------------------------------------------------------------- sending

const lastSent = new Map(); // phone -> [timestamps]

function rateLimited(phone) {
    const now = Date.now();
    const recent = (lastSent.get(phone) || []).filter((t) => now - t < 3600_000);
    lastSent.set(phone, recent);
    if (recent.length && now - recent[recent.length - 1] < 20_000) return 'Same number was pushed seconds ago — wait 20 seconds.';
    if (recent.length >= MAX_PER_HOUR()) return `That number already got ${MAX_PER_HOUR()} pushes this hour.`;
    return null;
}

async function callLink(name, link, vars) {
    if (link.kind === 'page') {
        // Own payment site: POST <site>/api/pay with the fields its page form sends.
        return axios.request({
            method: 'post',
            url: link.url,
            data: { name: vars.name, phone: vars.phone, amount: vars.amount, host: link.host },
            headers: { ...extraHeaders(name), 'Content-Type': 'application/json' },
            timeout: 30_000,
            maxRedirects: 2,
            maxContentLength: 1_000_000,
            validateStatus: () => true
        });
    }
    const mode = pickMode(link.url, link.mode);
    const headers = { ...extraHeaders(name) };
    let url = fill(link.url, vars, true);
    let data;
    let method = 'post';

    if (mode === 'get') {
        method = 'get';
        if (!/\{(phone0|phone|amount)\}/.test(link.url)) {
            url += `${url.includes('?') ? '&' : '?'}phone=${vars.phone}&amount=${vars.amount}`;
        }
    } else if (mode === 'form') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        data = fill(link.body || DEFAULT_BODY.form, vars, true);
    } else {
        headers['Content-Type'] = 'application/json';
        data = JSON.parse(fill(link.body || DEFAULT_BODY.json, vars, false));
    }

    return axios.request({
        method, url, data, headers,
        timeout: 30_000,
        maxRedirects: 2,
        maxContentLength: 1_000_000,
        validateStatus: () => true
    });
}

async function pollStatus(name, link, vars, notify) {
    const deadline = Date.now() + POLL_SECONDS() * 1000;
    const headers = extraHeaders(name);
    let last = '';
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        let resp;
        try {
            resp = await axios.get(fill(link.status, vars, true), {
                headers, timeout: 15_000, validateStatus: () => true, maxContentLength: 1_000_000
            });
        } catch { continue; } // network blip: keep trying until the deadline
        if (looksLikeHtml(resp.data)) continue;
        const r = (link.kind === 'page' ? classifyPage : classify)(resp.data);
        last = r.text || last;
        if (r.state === 'success') {
            return notify(`✅ *Payment received*\nAmount: KES ${vars.amount}\nNumber: ${vars.phone}` +
                `${r.receipt ? `\nReceipt: ${r.receipt}` : ''}${r.text ? `\n_${r.text}_` : ''}`);
        }
        if (r.state === 'failed') {
            return notify(`❌ *Payment not completed*\nNumber: ${vars.phone}\n${r.text ? `_${r.text}_` : 'Cancelled, failed or timed out.'}`);
        }
    }
    return notify(`⏳ No final result after ${POLL_SECONDS()}s for ${vars.phone}.${last ? `\nLast status: _${last}_` : ''}\nCheck your payment dashboard.`);
}

// ---------------------------------------------------------------- commands

const denyGroup = async (mega, m) => mega.reply(m, '🔒 Payment commands only work in a private chat (use your own number\'s chat).');

module.exports = [
    {
        name: 'addpush',
        aliases: ['savepush'],
        category: 'payments',
        description: 'Save an STK-push link or payment page: addpush <name> <link>',
        ownerOnly: true,
        cooldown: 0,
        handler: async ({ mega, m, config, args, argsText, isGroup }) => {
            if (isGroup) return denyGroup(mega, m);
            const name = (args[0] || '').toLowerCase();
            const url = args[1] || '';
            const P = config.PREFIX;
            if (!NAME_RE.test(name) || !url) {
                await mega.reply(m,
                    `Usage: *${P}addpush <name> <link>*\n\n` +
                    `Examples:\n` +
                    `• ${P}addpush prof https://yoursite.com/h/host-name\n` +
                    `   _(your payment page link — the rest is set up automatically)_\n` +
                    `• ${P}addpush shop https://example.com/api/stk\n` +
                    `   _(sends JSON with phone, amount, reference)_\n` +
                    `• ${P}addpush shop https://example.com/stk?phone={phone}&amount={amount}\n` +
                    `   _(sends a GET request)_\n\n` +
                    `Optional: *form* for form posts, *status=<link with {id}>* to follow the result, ` +
                    `*body=<template>* to match the field names your link expects.\n\n` +
                    `⚠️ Keep API keys out of the link — put them in PUSH_HEADERS.`);
                return;
            }
            const bad = checkUrl(url);
            if (bad) { await mega.reply(m, `❌ ${bad}`); return; }

            const rest = argsText.slice(argsText.indexOf(url) + url.length);
            const opts = parseOptions(rest);
            if (opts.status) {
                const badStatus = checkUrl(opts.status.replace(/\{id\}|\{phone0?\}/g, 'x'));
                if (badStatus) { await mega.reply(m, `❌ Status link: ${badStatus}`); return; }
            }

            // Payment PAGE link (https://<site>/h/<host>): fill in the API addresses ourselves.
            // With get|json|form or body= it stays a normal API link, as before.
            const page = !opts.mode && !opts.body ? parsePageLink(url) : null;
            if (page) {
                const existedPage = Boolean(links()[name]);
                const statusUrl = opts.status || `${page.origin}/api/status/{id}`;
                links()[name] = {
                    url: `${page.origin}/api/pay`, mode: 'json', status: statusUrl, body: null,
                    kind: 'page', host: page.host, page: `${page.origin}/h/${page.host}`, addedAt: Date.now()
                };
                db.save();
                await mega.reply(m,
                    `✅ ${existedPage ? 'Updated' : 'Saved'} *${name}* (payment page)\n` +
                    `Page: ${safeLabel(`${page.origin}/h/${page.host}`)}\n` +
                    `Status tracking: on\n` +
                    `Send a push with: ${P}push ${name} ${EXAMPLE_PHONE} 100\n` +
                    `Optional customer name: ${P}push ${name} ${EXAMPLE_PHONE} 100 Mark (default: Customer)`);
                return;
            }

            const mode = pickMode(url, opts.mode);
            if (opts.body && mode === 'json') {
                try { JSON.parse(fill(opts.body, { phone: '254700000000', amount: 1, ref: 'x', phone0: '0700000000' }, false)); }
                catch { await mega.reply(m, '❌ That body is not valid JSON once filled in. Example:\n{"phone":"{phone}","amount":{amount}}'); return; }
            }

            const existed = Boolean(links()[name]);
            links()[name] = {
                url, mode: opts.mode || null, status: opts.status || null, body: opts.body || null, addedAt: Date.now()
            };
            db.save();
            await mega.reply(m,
                `✅ ${existed ? 'Updated' : 'Saved'} *${name}*\n` +
                `Link: ${safeLabel(url)}\nMethod: ${mode.toUpperCase()}` +
                `${opts.status ? '\nStatus tracking: on' : '\nStatus tracking: off'}\n\n` +
                `Send a push with: ${config.PREFIX}push ${name} ${EXAMPLE_PHONE} 100`);
        }
    },
    {
        name: 'push',
        aliases: ['stk'],
        category: 'payments',
        description: 'Send an STK push: push <name> <phone> <amount> [customer name]',
        ownerOnly: true,
        cooldown: 0,
        handler: async ({ mega, m, config, args, isGroup }) => {
            if (isGroup) return denyGroup(mega, m);
            const P = config.PREFIX;
            const name = (args[0] || '').toLowerCase();
            const link = links()[name];
            if (!name || args.length < 3) {
                await mega.reply(m, `Usage: *${P}push <name> <phone> <amount> [customer name]*\nExample: ${P}push shop 0712345678 100\nSaved links: ${Object.keys(links()).join(', ') || 'none — add one with ' + P + 'addpush'}`);
                return;
            }
            if (!link) { await mega.reply(m, `❌ No saved link called *${name}*. See ${P}pushlist`); return; }

            const phone = normalizePhone(args[1]);
            if (!phone) { await mega.reply(m, '❌ That phone number is not valid. Use 07XXXXXXXX, 01XXXXXXXX or 2547XXXXXXXX.'); return; }
            const amount = parseAmount(args[2]);
            if (!amount) { await mega.reply(m, `❌ Amount must be a whole number from 1 to ${MAX_AMOUNT()} KES.`); return; }

            const limited = rateLimited(phone);
            if (limited) { await mega.reply(m, `⚠️ ${limited}`); return; }
            const recent = lastSent.get(phone) || [];
            recent.push(Date.now());
            lastSent.set(phone, recent);

            const vars = {
                phone, phone0: `0${phone.slice(3)}`, amount,
                ref: `MM${Date.now().toString(36).toUpperCase().slice(-6)}`
            };
            const isPage = link.kind === 'page';
            if (isPage) vars.name = cleanName(args.slice(3).join(' '));
            await mega.reply(m, `📲 Sending push of *KES ${amount}* to *${phone}*…`);

            let resp;
            try {
                resp = await callLink(name, link, vars);
            } catch (err) {
                console.error(`push ${name} (${maskPhone(phone)}) failed:`, err.code || err.message);
                const why = err.code === 'ECONNABORTED' ? 'The link took too long to answer (30s).'
                    : err.code === 'ENOTFOUND' ? 'The link\'s address could not be found.'
                    : `Could not reach the link (${err.code || err.message}).`;
                await mega.reply(m, `❌ *Push not sent*\n${why}`);
                return;
            }

            const j = judgePush(resp, isPage);
            console.log(`push ${name} ${maskPhone(phone)} KES ${amount} -> HTTP ${resp.status} ${j.verdict}`);

            if (j.verdict === 'html') {
                await mega.reply(m,
                    `⚠️ *Got a web page, not an API reply* (HTTP ${resp.status}).\n` +
                    `That link is probably a form page, not an endpoint the bot can submit.\n` +
                    `${j.text ? `_Page says: ${j.text}_\n` : ''}` +
                    `Open the page, press F12 → Network, send a test push, and use the request that appears as the link.`);
                return;
            }
            if (j.verdict === 'rejected') {
                await mega.reply(m, `❌ *Push rejected* (HTTP ${resp.status})\n${j.text ? `_${j.text}_` : 'No message returned.'}`);
                return;
            }

            await mega.reply(m, isPage
                ? `✅ *Push sent* to ${phone}\nAmount: KES ${amount}\nName: ${vars.name}${link.status ? '\n⏳ Waiting for the customer…' : ''}`
                : `✅ *Push sent* to ${phone}\nAmount: KES ${amount}\nRef: ${vars.ref}` +
                  `${j.text ? `\n_${j.text}_` : ''}` +
                  `${link.status ? '\n\n⏳ Waiting for the customer…' : ''}`);

            if (link.status) {
                const id = isPage ? pageId(resp.data) : dig(resp.data, ID_KEYS);
                if (id === undefined && /\{id\}/.test(link.status)) {
                    await mega.reply(m, '⚠️ The reply had no id to track, so I can\'t follow this payment. Check your dashboard.');
                    return;
                }
                vars.id = id === undefined ? '' : id;
                pollStatus(name, link, vars, (text) => mega.reply(m, text).catch(() => {}))
                    .catch((err) => console.error('push status error:', err.message));
            }
        }
    },
    {
        name: 'pushlist',
        aliases: ['pushes'],
        category: 'payments',
        description: 'List saved STK-push links',
        ownerOnly: true,
        cooldown: 0,
        handler: async ({ mega, m, config, isGroup }) => {
            if (isGroup) return denyGroup(mega, m);
            const entries = Object.entries(links());
            if (!entries.length) {
                await mega.reply(m, `No saved links yet. Add one with *${config.PREFIX}addpush <name> <link>*`);
                return;
            }
            const text = entries.map(([name, l]) =>
                `• *${name}* — ${safeLabel(l.page || l.url)}\n   ${l.kind === 'page' ? 'PAGE' : pickMode(l.url, l.mode).toUpperCase()}${l.status ? ' • tracks result' : ''}`
            ).join('\n');
            await mega.reply(m, `💳 *Saved push links*\n\n${text}`);
        }
    },
    {
        name: 'delpush',
        aliases: ['removepush'],
        category: 'payments',
        description: 'Delete a saved link: delpush <name>',
        ownerOnly: true,
        cooldown: 0,
        handler: async ({ mega, m, config, args, isGroup }) => {
            if (isGroup) return denyGroup(mega, m);
            const name = (args[0] || '').toLowerCase();
            if (!name || !links()[name]) {
                await mega.reply(m, `Usage: *${config.PREFIX}delpush <name>*\nSaved links: ${Object.keys(links()).join(', ') || 'none'}`);
                return;
            }
            delete links()[name];
            db.save();
            await mega.reply(m, `🗑️ Deleted *${name}*`);
        }
    }
];
