/**
 * routes/checkins.js
 * POST /api/checkins          — scan a UUID + mealType and record a check-in
 * GET  /api/checkins          — list all check-in events
 * DELETE /api/checkins/:uuid  — undo a specific meal check-in (?meal=breakfast)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const hackerStore = require('../services/hackerStore');
const checkinStore = require('../services/checkinStore');

// Load valid meal IDs from config (no hard-coding in logic)
function getValidMealIds() {
    const raw = fs.readFileSync(
        path.join(__dirname, '../data/mealTypes.json'), 'utf8'
    );
    return JSON.parse(raw).map(m => m.id);
}

/**
 * POST /api/checkins
 * Body: { uuid: string, mealType: string }
 * Returns: { status: "ok" | "unknown" | "duplicate", hacker?, checkin? }
 */
router.post('/', (req, res) => {
    const { uuid, mealType } = req.body;

    if (!uuid || typeof uuid !== 'string') {
        return res.status(400).json({ error: 'uuid is required' });
    }
    if (!mealType || typeof mealType !== 'string') {
        return res.status(400).json({ error: 'mealType is required' });
    }

    const validMeals = getValidMealIds();
    if (!validMeals.includes(mealType.trim())) {
        return res.status(400).json({
            error: `Invalid mealType. Must be one of: ${validMeals.join(', ')}`,
        });
    }

    const trimmedUUID = uuid.trim();
    const trimmedMeal = mealType.trim();

    // 1. Look up in known hacker list
    const hacker = hackerStore.findByUUID(trimmedUUID);
    if (!hacker) {
        return res.json({ status: 'unknown', uuid: trimmedUUID });
    }

    // 2. Check for duplicate (same person + same meal)
    const existing = checkinStore.findByUUIDAndMeal(trimmedUUID, trimmedMeal);
    if (existing) {
        return res.json({ status: 'duplicate', hacker, checkin: existing });
    }

    // 3. Record check-in
    const checkin = checkinStore.add({
        uuid: trimmedUUID,
        name: hacker.name,
        mealType: trimmedMeal,
    });
    return res.json({ status: 'ok', hacker, checkin });
});

/**
 * GET /api/checkins
 * Returns all check-in events, newest first.
 */
router.get('/', (req, res) => {
    res.json(checkinStore.getAll());
});

/**
 * DELETE /api/checkins/:uuid?meal=<mealType>
 * Undo a specific meal check-in for a hacker.
 * If ?meal is omitted, removes the first matching check-in (backward compat).
 */
router.delete('/:uuid', (req, res) => {
    const uuid = req.params.uuid.trim();
    const meal = req.query.meal ? req.query.meal.trim() : null;

    const removed = meal
        ? checkinStore.removeByUUIDAndMeal(uuid, meal)
        : checkinStore.removeByUUID(uuid);

    if (!removed) {
        return res.status(404).json({ error: 'No matching check-in found' });
    }
    return res.json({ status: 'removed', checkin: removed });
});

module.exports = router;
