# 🎯 Hacker Tracker

QR code check-in system for hackathon attendees. Scan a hacker's QR code (encoding their UUID), validate it against the registered attendee list, and log the check-in.

## Quick Start

```bash
npm install
npm start
```

Then open:
- **Scanner:** http://localhost:3000/
- **Admin:**   http://localhost:3000/admin.html

## Features

| Feature | Detail |
|---|---|
| QR scanning | Uses device camera + jsQR (CDN, no build step) |
| Manual entry | Paste UUID directly as a fallback |
| Check-in states | **ok**, **duplicate**, **unknown** — clearly colour-coded |
| Live feed | Recent check-ins shown on scanner page |
| Admin dashboard | Stats, filterable attendee table, add hackers, CSV export |
| Auto-refresh | Admin page reloads data every 15 seconds |

## Project Structure

```
hacker-tracker/
├── server/
│   ├── index.js              # Express entrypoint
│   ├── routes/
│   │   ├── checkins.js       # POST /api/checkins, GET /api/checkins
│   │   └── hackers.js        # GET /api/hackers, POST /api/hackers
│   ├── services/
│   │   ├── hackerStore.js    # Read/write hackers.json
│   │   └── checkinStore.js   # Read/write checkins.json
│   └── data/
│       ├── hackers.json      # Known attendee list
│       └── checkins.json     # Check-in event log
└── public/
    ├── index.html            # Scanner UI
    ├── admin.html            # Admin UI
    ├── app.js                # Scanner logic
    ├── admin.js              # Admin logic
    └── style.css
```

## API Reference

### `POST /api/checkins`
Check in a hacker by UUID.

**Body:** `{ "uuid": "<uuid>" }`

**Response:**
```json
{ "status": "ok",        "hacker": {...}, "checkin": {...} }
{ "status": "duplicate", "hacker": {...}, "checkin": {...} }
{ "status": "unknown",   "uuid": "..." }
```

### `GET /api/checkins`
Returns all check-in events (newest first).

### `GET /api/hackers`
Returns all registered hackers with `checkedIn` and `checkinTime` fields.

### `POST /api/hackers`
Register a new hacker.

**Body:** `{ "name": "...", "email": "...", "uuid": "..." }`  
UUID is auto-generated (v4) if omitted.

## Adding Hackers in Bulk

Edit `server/data/hackers.json` directly — one object per line:

```json
[
  { "uuid": "...", "name": "Alice", "email": "alice@example.com" },
  { "uuid": "...", "name": "Bob" }
]
```

Or use the Admin UI's **+ Add Hacker** button.

## QR Code Format

Each QR code should encode a bare UUID string, e.g.:

```
550e8400-e29b-41d4-a716-446655440001
```

Generate codes at [qr-code-generator.com](https://www.qr-code-generator.com/) or using any QR library.

## Extending

- **Swap storage backend** → edit `server/services/hackerStore.js` and `checkinStore.js`. Routes are unaffected.
- **Add new endpoints** → create a new file in `server/routes/` and mount it in `server/index.js`.
- **Change QR library** → only `public/app.js` calls jsQR; swap it there.
