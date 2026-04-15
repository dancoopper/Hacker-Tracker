/**
 * routes/mealTypes.js
 * GET /api/meal-types — returns the configured list of meal options.
 * To add or remove a meal, edit server/data/mealTypes.json only.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const MEAL_TYPES_PATH = path.join(__dirname, '../data/mealTypes.json');

router.get('/', (req, res) => {
    try {
        const raw = fs.readFileSync(MEAL_TYPES_PATH, 'utf8');
        res.json(JSON.parse(raw));
    } catch (err) {
        res.status(500).json({ error: 'Could not load meal types' });
    }
});

module.exports = router;
