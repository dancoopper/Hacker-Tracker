/**
 * routes/hackers.js
 * GET  /api/hackers — list all hackers with check-in status (single RSVP_list query)
 * POST /api/hackers — register a new hacker
 *
 * No checkinStore — check-in state comes directly from hackerStore (RSVP_list).
 */

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const hackerStore = require('../services/hackerStore');

/**
 * GET /api/hackers
 * Returns all rows from RSVP_list — check-in state is already embedded
 * (checked_in, checkin_time columns), so no join is needed.
 */
router.get('/', async (req, res) => {
    try {
        res.json(await hackerStore.getAll());
    } catch (err) {
        console.error('[hackers GET]', err);
        res.status(500).json({ error: err.message });
    }
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
