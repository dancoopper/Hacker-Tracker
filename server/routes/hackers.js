/**
 * routes/hackers.js
 * GET  /api/hackers — list all hackers with check-in status (single RSVP_list query)
 * POST /api/hackers — register a new hacker
 *
 * No checkinStore — check-in state comes directly from hackerStore (RSVP_list).
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const hackerStore = require('../services/hackerStore');

/**
 * GET /api/hackers
 * Returns all hackers enriched with their meal check-in records.
 * Each hacker gains:
 *   checkedIn  — true if they have at least one meal check-in
 *   checkinTime — timestamp of their first check-in (backward compat)
 *   meals       — array of { mealType, timestamp } for every meal they attended
 */
router.get('/', (req, res) => {
    const hackers = hackerStore.getAll();
    const checkins = checkinStore.getAll();          // newest-first

    // Group all check-in records by UUID
    const mealsByUUID = new Map();
    checkins.forEach(c => {
        if (!mealsByUUID.has(c.uuid)) mealsByUUID.set(c.uuid, []);
        mealsByUUID.get(c.uuid).push({ mealType: c.mealType, timestamp: c.timestamp });
    });

    const enriched = hackers.map(h => {
        const meals = mealsByUUID.get(h.uuid) ?? [];
        // Sort meals oldest-first for display
        meals.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return {
            ...h,
            meals,
            checkedIn: meals.length > 0,
            checkinTime: meals[0]?.timestamp ?? null,   // first meal time
        };
    });

    res.json(enriched);
});


/**
 * POST /api/hackers
 * Body: { name: string, email?: string, uuid?: string }
 * UUID is auto-generated if not provided.
 */
router.post('/', async (req, res) => {
    const { name, email, uuid } = req.body;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' });
    }

    const finalUUID = (uuid && typeof uuid === 'string' && uuid.trim())
        ? uuid.trim()
        : uuidv4();

    try {
        const hacker = await hackerStore.add({ uuid: finalUUID, name, email });
        return res.status(201).json(hacker);
    } catch (err) {
        console.error('[hackers POST]', err);
        return res.status(409).json({ error: err.message });
    }
});

module.exports = router;
