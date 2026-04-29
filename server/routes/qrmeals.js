/**
 * routes/qrmeals.js
 *
 * POST /api/qrmeals/scan
 *   Body: { code: string, meal: "breakfast"|"lunch"|"dinner" }
 *   Scans a QR code and records a meal for it.
 *   Auto-creates the code if it's new.
 *   Returns: { status: "ok", code, breakfast, lunch, dinner }
 *
 * GET /api/qrmeals
 *   Returns all QR codes with their per-meal counts.
 *
 * POST /api/qrmeals/:code/add
 *   Body: { meal: "breakfast"|"lunch"|"dinner" }
 *   Admin: manually add 1 meal to a code.
 *
 * POST /api/qrmeals/:code/remove
 *   Body: { meal: "breakfast"|"lunch"|"dinner" }
 *   Admin: manually remove 1 meal from a code (min 0).
 */

const express = require('express');
const router = express.Router();
const qrMealStore = require('../services/qrMealStore');

// ── Scan (QR scanner page) ────────────────────────────────────────────────────

router.post('/scan', async (req, res) => {
    const { code, meal } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ error: 'code is required' });
    }
    if (code.length > 500) {
        return res.status(400).json({ error: 'QR code is too long (max 500 characters)' });
    }
    if (!meal || typeof meal !== 'string') {
        return res.status(400).json({ error: 'meal is required (breakfast, lunch, or dinner)' });
    }

    const mealLower = meal.toLowerCase();
    if (!qrMealStore.VALID_MEALS.includes(mealLower)) {
        return res.status(400).json({
            error: `Invalid meal. Must be one of: ${qrMealStore.VALID_MEALS.join(', ')}`,
        });
    }

    try {
        const updated = await qrMealStore.addMeal(code.trim(), mealLower);
        return res.json({ status: 'ok', ...updated });
    } catch (err) {
        console.error('[qrmeals POST /scan]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── List all (admin) ──────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const rows = await qrMealStore.getAll();
        return res.json(rows);
    } catch (err) {
        console.error('[qrmeals GET /]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── Get single code (scanner modal) ──────────────────────────────────────────

router.get('/:code', async (req, res) => {
    const code = decodeURIComponent(req.params.code).trim();
    try {
        const row = await qrMealStore.findOrCreate(code);
        return res.json({ status: 'ok', ...row });
    } catch (err) {
        console.error('[qrmeals GET /:code]', err);
        return res.status(500).json({ error: err.message });
    }
});


router.post('/:code/add', async (req, res) => {
    const code = decodeURIComponent(req.params.code).trim();
    const { meal } = req.body;

    if (!meal) return res.status(400).json({ error: 'meal is required' });

    try {
        const updated = await qrMealStore.addMeal(code, meal.toLowerCase());
        return res.json({ status: 'ok', ...updated });
    } catch (err) {
        console.error('[qrmeals POST /:code/add]', err);
        return res.status(400).json({ error: err.message });
    }
});

router.post('/:code/remove', async (req, res) => {
    const code = decodeURIComponent(req.params.code).trim();
    const { meal } = req.body;

    if (!meal) return res.status(400).json({ error: 'meal is required' });

    try {
        const updated = await qrMealStore.removeMeal(code, meal.toLowerCase());
        if (!updated) return res.status(404).json({ error: 'QR code not found' });
        return res.json({ status: 'ok', ...updated });
    } catch (err) {
        console.error('[qrmeals POST /:code/remove]', err);
        return res.status(400).json({ error: err.message });
    }
});

module.exports = router;
