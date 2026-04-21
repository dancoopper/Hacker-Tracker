/**
 * server/index.js
 * Express application entrypoint.
 * Mounts API routes and serves the static frontend.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const checkinsRouter = require('./routes/checkins');
const hackersRouter = require('./routes/hackers');
const mealTypesRouter = require('./routes/mealTypes');
const hackersRouter = require('./routes/hackers');
const mealsRouter = require('./routes/meals');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/checkins', checkinsRouter);
app.use('/api/hackers', hackersRouter);
app.use('/api/meal-types', mealTypesRouter);
app.use('/api/checkins', checkinsRouter);
app.use('/api/hackers', hackersRouter);
app.use('/api/meals', mealsRouter);

// ── Static Frontend ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// Catch-all — serve index.html for unknown GET routes (SPA-friendly)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🎯 Hacker Tracker running at http://localhost:${PORT}`);
    console.log(`   Scanner:  http://localhost:${PORT}/`);
    console.log(`   Admin:    http://localhost:${PORT}/admin.html`);
});
