# Barber shop website with online booking

A one-page barber shop site (prices, barbers, hours, address) with a real booking system:

- Customers pick a **service → barber (or anyone free) → day → time**, enter name and phone, and get a **booking code**.
- Taken times disappear automatically. Two people can never book the same chair at the same time.
- Customers can **cancel** with their code at `/cancel`.
- Staff open **`/admin`** (password) to see each day's bookings per barber, cancel, and **block time** (lunch, day off).
- A live **"Next free chair"** card at the top of the site.
- Light and dark mode, works on phones.

All shop details (name, address, phone, hours, services, prices, barbers and their working days) are in **`shop.js`**. Edit that file to make it your shop.

## Run it

Needs Node.js 20+.

```bash
cd barber-shop
npm install
npm start            # http://localhost:3002
npm test             # booking-rule tests
```

Staff page: http://localhost:3002/admin. Demo password: `barber123` (set `ADMIN_PASSWORD` to change it).

## Put it online for free (Render + Turso)

1. **Turso** (database): sign up at turso.tech, create a database, and copy its URL and a token.
2. **Render** (website): on render.com, choose **New › Web Service** and pick this GitHub repo.
   - **Root Directory:** `barber-shop`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment variables:**
     - `TURSO_DATABASE_URL`: your Turso URL
     - `TURSO_AUTH_TOKEN`: your Turso token
     - `ADMIN_PASSWORD`: a strong staff password
3. Open the `https://….onrender.com` address. Render's free plan sleeps after about 15 minutes idle, so the first visit afterwards takes about 30–60 seconds.

## Files

```
shop.js          shop details, services, prices, barbers  ← edit this
slots.js         booking rules (opening hours, overlaps, 30 min notice)
server.js        website + booking API + staff API
public/          index.html, app.js (site + booking), admin.html/js, cancel.html, styles.css
```
