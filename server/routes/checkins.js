/**
 * routes/checkins.js
 * POST /api/checkins          — scan a UUID + mealType and record a check-in
 * GET  /api/checkins          — list all check-in events
 * DELETE /api/checkins/:uuid  — undo a specific meal check-in (?meal=breakfast)
 * POST   /api/checkins       — check in a hacker (updates RSVP_list directly)
 * GET    /api/checkins       — list all checked-in hackers
 * DELETE /api/checkins/:uuid — undo a check-in
 *
 * No checkinStore — everything goes through hackerStore → RSVP_list.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
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
 * Body: { uuid: string }
 * Returns: { status: "ok" | "unknown" | "duplicate", hacker? }
 * Response is sent AFTER Supabase confirms the update.
 */

router.post('/', async (req, res) => {
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
    try {
        // 1. Look up hacker in RSVP_list
        const hacker = await hackerStore.findByUUID(trimmed);
        if (!hacker) {
            return res.json({ status: 'unknown', uuid: trimmed });
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
        // 2. Already checked in?
        if (hacker.checkedIn) {
            return res.json({
                status: 'duplicate',
                hacker,
                checkin: { uuid: hacker.uuid, name: hacker.name, timestamp: hacker.checkinTime },
            });
        }

        // 3. Mark as checked in — awaits Supabase confirmation
        const updated = await hackerStore.checkin(trimmed);
        return res.json({
            status: 'ok',
            hacker: updated,
            checkin: { uuid: updated.uuid, name: updated.name, timestamp: updated.checkinTime },
        });

    } catch (err) {
        console.error('[checkins POST]', err);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/checkins
 * Returns all currently checked-in hackers, newest first.
 */
router.get('/', async (req, res) => {
    try {
        const checkedIn = await hackerStore.getAllCheckedIn();
        // Shape matches what app.js feed expects: { uuid, name, timestamp }
        res.json(checkedIn.map(h => ({
            uuid: h.uuid,
            name: h.name,
            timestamp: h.checkinTime,
        })));
    } catch (err) {
        console.error('[checkins GET]', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/checkins/:uuid?meal=<mealType>
 * Undo a specific meal check-in for a hacker.
 * If ?meal is omitted, removes the first matching check-in (backward compat).
 * DELETE /api/checkins/:uuid
 * Undo a check-in. Returns the updated record or 404.
 */
router.delete('/:uuid', async (req, res) => {
    const uuid = req.params.uuid.trim();
    const meal = req.query.meal ? req.query.meal.trim() : null;

    const removed = meal
        ? checkinStore.removeByUUIDAndMeal(uuid, meal)
        : checkinStore.removeByUUID(uuid);

    if (!removed) {
        return res.status(404).json({ error: 'No matching check-in found' });
    }
    return res.json({ status: 'removed', checkin: removed });
    try {
        const hacker = await hackerStore.findByUUID(uuid);
        if (!hacker || !hacker.checkedIn) {
            return res.status(404).json({ error: 'No check-in found for that UUID' });
        }
        const updated = await hackerStore.undoCheckin(uuid);
        return res.json({ status: 'removed', checkin: { uuid: updated.uuid, name: updated.name } });
    } catch (err) {
        console.error('[checkins DELETE]', err);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
