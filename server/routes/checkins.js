/**
 * routes/checkins.js
 * POST /api/checkins — scan a UUID and record a check-in
 * GET  /api/checkins — list all check-in events
 */

const express = require('express');
const router = express.Router();
const hackerStore = require('../services/hackerStore');
const checkinStore = require('../services/checkinStore');

/**
 * POST /api/checkins
 * Body: { uuid: string }
 * Returns: { status: "ok" | "unknown" | "duplicate", hacker?, checkin? }
 */
router.post('/', (req, res) => {
    const { uuid } = req.body;

    if (!uuid || typeof uuid !== 'string') {
        return res.status(400).json({ error: 'uuid is required' });
    }

    const trimmed = uuid.trim();

    // 1. Look up in known hacker list
    const hacker = hackerStore.findByUUID(trimmed);
    if (!hacker) {
        return res.json({ status: 'unknown', uuid: trimmed });
    }

    // 2. Check for duplicate check-in
    const existing = checkinStore.findByUUID(trimmed);
    if (existing) {
        return res.json({ status: 'duplicate', hacker, checkin: existing });
    }

    // 3. Record check-in
    const checkin = checkinStore.add({ uuid: trimmed, name: hacker.name });
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
 * DELETE /api/checkins/:uuid
 * Remove a check-in (undo). Returns the removed record or 404.
 */
router.delete('/:uuid', (req, res) => {
    const uuid = req.params.uuid.trim();
    const removed = checkinStore.removeByUUID(uuid);
    if (!removed) {
        return res.status(404).json({ error: 'No check-in found for that UUID' });
    }
    return res.json({ status: 'removed', checkin: removed });
});

module.exports = router;
