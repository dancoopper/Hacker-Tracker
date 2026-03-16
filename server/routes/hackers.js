/**
 * routes/hackers.js
 * GET  /api/hackers     — list all registered hackers
 * POST /api/hackers     — register a new hacker
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const hackerStore = require('../services/hackerStore');
const checkinStore = require('../services/checkinStore');

/**
 * GET /api/hackers
 * Returns all hackers, with a `checkedIn` boolean and `checkinTime` for each.
 */
router.get('/', (req, res) => {
    const hackers = hackerStore.getAll();
    const checkins = checkinStore.getAll();
    const checkinMap = new Map(checkins.map(c => [c.uuid, c]));

    const enriched = hackers.map(h => ({
        ...h,
        checkedIn: checkinMap.has(h.uuid),
        checkinTime: checkinMap.get(h.uuid)?.timestamp ?? null,
    }));

    res.json(enriched);
});

/**
 * POST /api/hackers
 * Body: { name: string, email?: string, uuid?: string }
 * UUID is auto-generated if not provided.
 */
router.post('/', (req, res) => {
    const { name, email, uuid } = req.body;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' });
    }

    const finalUUID = (uuid && typeof uuid === 'string' && uuid.trim()) ? uuid.trim() : uuidv4();

    try {
        const hacker = hackerStore.add({ uuid: finalUUID, name, email });
        return res.status(201).json(hacker);
    } catch (err) {
        return res.status(409).json({ error: err.message });
    }
});

module.exports = router;
