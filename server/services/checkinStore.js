/**
 * checkinStore.js
 * Pure data-access module for check-in events.
 * Swap this file to change the persistence backend (JSON → DB, etc.)
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

/** Find a check-in by UUID. Returns the event or null (for duplicate detection). */
function findByUUID(uuid) {
    const checkins = read();
    return checkins.find(c => c.uuid === uuid) ?? null;
}

/**
 * Record a new check-in event.
 * @param {{ uuid: string, name: string }} event
 */
function add(event) {
    const checkins = read();
    const record = {
        uuid: event.uuid,
        name: event.name,
        timestamp: new Date().toISOString(),
    };
    checkins.push(record);
    write(checkins);
    return record;
}

/**
 * Remove a check-in by UUID (undo check-in).
 * Returns the removed record, or null if no matching check-in existed.
 */
function removeByUUID(uuid) {
    const checkins = read();
    const idx = checkins.findIndex(c => c.uuid === uuid);
    if (idx === -1) return null;
    const [removed] = checkins.splice(idx, 1);
    write(checkins);
    return removed;
}

module.exports = { getAll, findByUUID, add, removeByUUID };
