/**
 * checkinStore.js
 * Pure data-access module for check-in events.
 * Each record now includes a `mealType` field so the same hacker
 * can check in multiple times (once per meal).
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/checkins.json');

function read() {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
}

function write(data) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

/** Returns all check-in events, newest first. */
function getAll() {
    return read().slice().reverse();
}

/**
 * Find a check-in by UUID + mealType (used for duplicate detection).
 * A hacker may have multiple records — one per distinct meal.
 */
function findByUUIDAndMeal(uuid, mealType) {
    const checkins = read();
    return checkins.find(c => c.uuid === uuid && c.mealType === mealType) ?? null;
}

/** Returns ALL check-ins for a given UUID (all meals). */
function findAllByUUID(uuid) {
    const checkins = read();
    return checkins.filter(c => c.uuid === uuid);
}

/**
 * Record a new check-in event.
 * @param {{ uuid: string, name: string, mealType: string }} event
 */
function add(event) {
    const checkins = read();
    const record = {
        uuid: event.uuid,
        name: event.name,
        mealType: event.mealType,
        timestamp: new Date().toISOString(),
    };
    checkins.push(record);
    write(checkins);
    return record;
}

/**
 * Remove a check-in by UUID + mealType (targeted undo).
 * Returns the removed record, or null if not found.
 */
function removeByUUIDAndMeal(uuid, mealType) {
    const checkins = read();
    const idx = checkins.findIndex(c => c.uuid === uuid && c.mealType === mealType);
    if (idx === -1) return null;
    const [removed] = checkins.splice(idx, 1);
    write(checkins);
    return removed;
}

/**
 * Remove ALL check-ins for a UUID (full undo — kept for backward compat).
 */
function removeByUUID(uuid) {
    const checkins = read();
    const idx = checkins.findIndex(c => c.uuid === uuid);
    if (idx === -1) return null;
    const [removed] = checkins.splice(idx, 1);
    write(checkins);
    return removed;
}

module.exports = { getAll, findByUUIDAndMeal, findAllByUUID, add, removeByUUIDAndMeal, removeByUUID };
