/**
 * routes/meals.js
 *
 * POST /api/meals/:meal
 *   Params:  meal — one of "breakfast" | "lunch" | "dinner"
 *   Body:    { id: string }   — used to look up the row in RSVP_list
 *
 * Behaviour:
 *   - If the column for that meal is FALSE  → set it to TRUE, return { status: "ok" }
 *   - If the column for that meal is TRUE   → return { status: "already_checked_in" }
 *   - If no matching row found              → return { status: "not_found" }
 */

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

const VALID_MEALS = ['breakfast', 'lunch', 'dinner'];

router.post('/:meal', async (req, res) => {
    const meal = req.params.meal.toLowerCase();

    // Validate meal name
    if (!VALID_MEALS.includes(meal)) {
        return res.status(400).json({
            error: `Invalid meal. Must be one of: ${VALID_MEALS.join(', ')}`,
        });
    }

    const { id } = req.body;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'id is required in the request body' });
    }

    // 1. Fetch the row from RSVP_list
    const { data: rows, error: fetchError } = await supabase
        .from('RSVP_list')
        .select(`id, ${meal}`)
        .eq('id', id.trim())
        .limit(1);

    if (fetchError) {
        console.error('[meals] Supabase fetch error:', fetchError);
        return res.status(500).json({ error: 'Database error: ' + fetchError.message });
    }

    if (!rows || rows.length === 0) {
        return res.json({ status: 'not_found', id });
    }

    const row = rows[0];

    // 2. Check current value
    if (row[meal] === true) {
        return res.json({ status: 'already_checked_in', meal, id });
    }

    // 3. Flip to true
    const { error: updateError } = await supabase
        .from('RSVP_list')
        .update({ [meal]: true })
        .eq('id', id.trim());

    if (updateError) {
        console.error('[meals] Supabase update error:', updateError);
        return res.status(500).json({ error: 'Database error: ' + updateError.message });
    }

    return res.json({ status: 'ok', meal, id });
});

/**
 * GET /api/meals/status?email=...
 * Returns the current breakfast/lunch/dinner values for a given email.
 */
router.get('/status', async (req, res) => {
    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: 'id query param is required' });
    }

    const { data: rows, error } = await supabase
        .from('RSVP_list')
        .select('id, breakfast, lunch, dinner')
        .eq('id', id.trim())
        .limit(1);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    if (!rows || rows.length === 0) {
        return res.json({ status: 'not_found', id });
    }

    return res.json({ status: 'ok', ...rows[0] });
});

module.exports = router;
