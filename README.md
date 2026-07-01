# Griffin Hall Coffee — website

A clean, warm‑editorial site whose one job is to turn visitors into **RSVPs**. Griffin manages
everything from a single **Google Sheet**; the site reads events from it and files each RSVP into
that event's own tab.

- **Events (home)** — `index.html`: live list of upcoming events pulled from the Sheet.
- **RSVP** — `rsvp.html?event=<#>`: one event, a color‑coded capacity bar, and a 3‑field form
  (Name, Email, Location). Optional "pay ahead via Venmo".
- **Photos** — `photos.html`: gallery + testimonials (placeholders for now).
- **Consulting** — `consulting.html`: corporate/trade services + collaboration contact.

No framework, no build step. Plain HTML/CSS/JS, hosted on GitHub Pages.

---

## How Griffin adds / removes events (no code)

Everything lives in the Google Sheet:
`https://docs.google.com/spreadsheets/d/12zMTrRJJlot2iBu9Yo3RIk5bECUkFnEi2hcwy_4ZqF4/edit`

1. Open the **Events** tab.
2. Add a row. Columns (row 1 must be these headers):

   | # | Name | Date | Time | Location | Category | Blurb | Capacity | Price |
   |---|------|------|------|----------|----------|-------|----------|-------|
   | 1 | Palate Development & Cupping | 2026-07-12 | 10:00 AM | Portland, OR | Cupping | Slow down and taste… | 20 | 25 |

   - **#** — a number (1, 2, 3…). Keep it stable for each event; it's used in the RSVP link.
   - **Date** — a real date (e.g. `2026-07-12`). **Past events disappear from the site automatically.**
   - **Capacity** — max attendees (drives the spots bar). Blank = 20.
   - **Price** — optional; shown next to the Venmo button.

3. That's it — the website updates on the next page load. To remove an event, delete its row
   (or just let its date pass).

**RSVPs** for each event collect in their own tab named `"<#> — <Name>"` (e.g. `1 — Palate Development & Cupping`),
created automatically on the first sign‑up, with columns: Timestamp · Name · Email · Location.
Email "classes of people" by opening the relevant event tab (and/or filtering by Location).

---

## One‑time backend setup (the Google Sheet CMS)

1. Open the spreadsheet above and add an **Events** tab with the header row shown, plus your events.
2. **Extensions ▸ Apps Script**. Delete any starter code, paste the contents of
   [`apps-script/Code.gs`](apps-script/Code.gs), and **Save**.
3. **Deploy ▸ New deployment ▸ Web app**:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   - Deploy, authorize, and **copy the Web app URL** (ends in `/exec`).
4. Paste that URL into [`assets/js/config.js`](assets/js/config.js) → `APPS_SCRIPT_URL`.
5. Commit + push.

> If you change `Code.gs` later, redeploy (**Deploy ▸ Manage deployments ▸ Edit ▸ New version**).
> The `/exec` URL stays the same.

While `APPS_SCRIPT_URL` is blank, the site runs on the demo events in `config.js` so you can preview
the design locally.

---

## Local preview

```bash
cd ~/griffin_website
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (GitHub Pages)

1. Create a GitHub repo and push these files.
2. **Settings ▸ Pages ▸** deploy from `main` / root.
3. The included `CNAME` sets the domain to `griffinhallcoffee.com` — point the domain's DNS at
   GitHub Pages (an `A`/`CNAME` record per GitHub's docs).

---

## Editable bits (in `assets/js/config.js`)

- `APPS_SCRIPT_URL` — the deployed backend URL.
- `VENMO_HANDLE` — `griffinhallcoffee`.
- `CONTACT_EMAIL` — `griffinhallconsulting@gmail.com`.
- `SOCIAL` — Instagram / YouTube / LinkedIn links (shown in the footer).

## Not built yet (future phases)

- Automatic confirmation / segment emails (data is collected now; email sends can be added later).
- Real logo, photos, video, and testimonials (currently tasteful placeholders).
