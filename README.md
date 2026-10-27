# MEGA MIND — WhatsApp Bot

A WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys). This
is the **bot** — it has no session-linking UI of its own. Sessions are created by
the separate **mega-mind-sessions** app and handed to this bot via a `SESSION_ID`.

## Why two separate apps?

- Restart/redeploy the bot anytime without forcing anyone to re-link WhatsApp.
- One session server can serve linking for multiple bot deployments.
- Smaller, simpler dependency footprint for each app.

They're linked only through `SESSION_SERVER_URL` (see below) — neither app's code
imports or depends on the other's.

## Quick start

```bash
npm install
cp .env.example .env
```

Get a `SESSION_ID` one of two ways:

**Option A — web session server (recommended):**
Deploy `mega-mind-sessions` separately, open it in a browser, link via QR or
pairing code, then paste the `SESSION_ID` it shows you into this bot's `.env`.

**Option B — local CLI:**
```bash
npm run session
```
Scan the QR code shown in your terminal. The resulting `SESSION_ID` is printed
and saved to `session.txt` — paste it into `.env`.

Either way, your `.env` should end up with:
```
SESSION_ID=MEGA~eyJjcmVkcyI6...
```

Then:
```bash
npm start
```

## Configuration

All settings live in `.env` (see `.env.example` for the full list with
explanations) and are read once into `config.js`. Key ones:

| Variable | Purpose |
|---|---|
| `OWNER_NUMBER` | Your number, digits only, no `+` |
| `PREFIX` | Command prefix (default `.`) |
| `MODE` | `public`, `private`, or `self` |
| `SESSION_ID` | Your session, from either option above |
| `SESSION_SERVER_URL` | URL of your deployed mega-mind-sessions app |
| `AUTO_FETCH_SESSION` | Set `true` only if `SESSION_ID` is a session-server id (`MM_...`) rather than the full `MEGA~...` string |

## Feature set (core)

**General** — `.menu` `.ping` `.info` `.alive` `.owner` `.stats` `.top`

**Group admin** *(admin-only, bot must be group admin)* — `.kick` `.add`
`.promote` `.demote` `.mute` `.unmute` `.tagall` `.groupinfo` `.setname`
`.setdesc` `.warn` `.clearwarn` (`.warns` is open to all members)

**Protection** *(owner/admin-controlled toggles)*
- AntiLink — deletes invite links from non-admins, per group
- AntiForward — deletes forwarded messages from non-admins, per group
- AntiDelete — resends "deleted for everyone" messages, per group
- Welcome / Goodbye — greets joins, notes departures, per group, with
  editable templates (`.setwelcome` / `.setgoodbye`, `.resetwelcome` /
  `.resetgoodbye`). Placeholders: `{user}`, `{group}`, `{count}`.
- Warnings — `.warn` a member up to 3 times, then they're removed
- AntiBug — filters malformed/oversized/abusive incoming payloads (defensive only — this bot does not include tools for sending malformed payloads to anyone)
- AutoBlock — auto-blocks non-owner DMs when `MODE=private`
- Status auto-react / auto-view
- `.mode` `.setprefix` `.statusreact` `.antibug`

**Media** — `.sticker` (image/video → sticker), `.toimg` (sticker → image),
`.take` (re-pack a sticker with new pack/author name), `.viewonce` (reply to
view-once media to re-send it normally, or to normal media to send it as
view-once)

**Utility** — `.afk`, `.block` / `.unblock` (WhatsApp-level, owner only),
`.broadcast` (owner only, message every group the bot is in)

**Owner** — `.ban` / `.unban` / `.banlist` (bot-level — banned users are
ignored by the bot everywhere, separate from WhatsApp blocking)

More commands (downloaders, fun/economy, AI chat) are planned for a later pass.

## Project structure

```
index.js              entrypoint — connection lifecycle, event wiring
config.js              single source of truth for all settings
lib/
  sessionManager.js     resolves session: local / pasted / fetched from server
  database.js           JSON-file persistence (users, groups, bans, AFK, stats)
  megaHandler.js         shared helpers (send/reply, group admin actions, perms)
  commandHandler.js      loads commands/, dispatches + enforces permissions
  messageParser.js        normalizes Baileys' message shape into simple fields
  groupEvents.js          antilink/antiforward + welcome/goodbye (event-driven, not commands)
  antiDelete.js            caches messages, resends them if deleted
  antibug.js               defensive filter for malformed incoming messages
  autoBlock.js             private-mode auto-block
  statusReact.js           status auto-view/react
  commandReactor.js        emoji reactions reflecting command state
  getSessionLocal.js       CLI alternative to the web session server
commands/
  general.js, group.js, settings.js, media.js, utility.js, owner.js
```

## Deploying

Works on Render, Railway, Heroku-style platforms. `Procfile` and `render.yaml`
are included. Needs a **persistent disk** (or equivalent) if you want the
`./session` folder and `database.json` to survive restarts — otherwise you'll
need to re-link after every redeploy.

### Health check

If the service is a Render **Web Service** (so it receives `PORT`), the bot
starts a tiny HTTP server:

- `GET /health` → `{ ok, bot, version, connected, user, uptimeSeconds }`

Point a free uptime monitor (UptimeRobot, cron-job.org) at it to keep a free
instance awake. Deployed as a **worker** (no `PORT`), the endpoint is skipped —
workers are kept alive by the platform instead.

The bot also survives stray async errors (`uncaughtException` is logged rather
than fatal) and retries disconnects with jittered backoff.

## A note on safety

This bot does not include any feature for sending malformed/crash-inducing
payloads to other WhatsApp users — AntiBug here is purely defensive (it only
inspects messages sent *to* the bot). If you find a fork of this project that
adds that kind of "bug sender" feature, don't run it against real groups —
it's intended to disrupt other people's WhatsApp clients without consent.
