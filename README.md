# ChoreQuest 🪙

A bright, playful family chore-and-earnings app. Parents assign chores and set prices, everyone taps **Done!**, a parent approves, and the money lands in their wallet, split into **Spend / Save / Give** jars.

It's an installable web app (PWA): open it on any phone and choose **Add to Home Screen**.

## Features

- **Today board**: big chore cards with icon, price and a **Done!** button (plus optional 📷 photo proof)
- **Assigning**: give a chore to one person, or leave it open for anyone to claim (“I'll do it!”)
- **Repeats**: every day, once a week, chosen weekdays, or one time
- **Approval**: parent approves (coins + confetti) or sends it back with a short note
- **Wallet**: Earned, Paid out, Still owed, history, three jars with your own split, savings goal with a progress bar
- **Payday**: what each person is owed, with a **Mark as paid** button
- **Fun**: streak bonus 🔥 (default: every 3 days in a row = +0.50), bonus jobs 💎, levels, 9 badges, a friendly weekly family board
- **Parent PIN** so kids can't approve their own chores
- **Live sync**: every phone updates instantly when something changes
- English + Azerbaijani (all text is in `web/src/translations.js`), light/dark mode, AZN by default (changeable)
- Sample family + chores on first run, with a **Clear sample data** button (Parent › Family)

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. To try it from your phone on the same Wi‑Fi, open the “Network” address that the terminal prints.

Production mode (one server for the app and the API):

```bash
npm run build
npm start          # http://localhost:3001
```

Run the tests with `npm test`.

## How it works

- **Server**: `server/` is a small Node.js + Express API. It stores everything in **SQLite** through `@libsql/client`. Locally that is the file `data/chorequest.db`. Online it can be a free **Turso** cloud database.
- **Web app**: `web/` is React + Vite. The PWA (offline shell, icons, install) is set up by `vite-plugin-pwa`.
- **Families**: creating a family gives it a 6-letter **family code**. Other phones join with that code and pick “Who are you?”. Parent actions need the PIN.
- Money is stored as whole cents (qəpik) to avoid rounding errors.

```
server/index.js      API routes
server/logic.js      approvals, streak bonus, badges, wallet totals
server/samples.js    sample family data
server/db.js         database connection + tables
web/src/screens/     Today, Wallet, Family, Parent, Welcome, Me
web/src/translations.js   all text (English + Azerbaijani)
web/src/styles.css   colours, fonts, light/dark theme
web/src/shared/schedule.js  date/repeat/streak rules (shared by server and app)
```

## Put it online for free

The simplest free setup is **Render** (runs the server) + **Turso** (keeps the database safe).

1. **Database (Turso, free)**
   - Sign up at https://turso.tech and create a database.
   - Copy its URL (`libsql://…turso.io`) and create an auth token.
2. **Server (Render, free)**
   - Push this repo to GitHub.
   - On https://render.com, choose **New › Web Service** and pick the repo.
   - Build command: `npm install --include=dev && npm run build`
   - Start command: `npm start`
   - Environment variables:
     - `TURSO_DATABASE_URL` = your Turso URL
     - `TURSO_AUTH_TOKEN` = your Turso token
     - `APP_SECRET` = any long random text (keeps parent logins valid across restarts)
3. Open your `https://…onrender.com` address on each phone and **Add to Home Screen**.

Notes:
- Render's free plan sleeps after about 15 minutes without visitors, so the first open after a break takes around 30–60 seconds.
- Don't use Render's own disk for the database on the free plan. It is wiped on every deploy, which is why Turso is used.
- Any host that runs Node works too (Railway, Fly.io, a home server). Without the Turso variables, data goes to `data/chorequest.db`.

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3001` | Server port |
| `DB_FILE` | `data/chorequest.db` | Local database file |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | – | Use a Turso cloud database instead |
| `APP_SECRET` | auto-generated, stored in the DB | Signs parent-mode sessions |

## Renaming the app

Change `appName` in `web/src/translations.js`, `name`/`short_name` in `vite.config.js`, and `<title>` in `web/index.html`.
