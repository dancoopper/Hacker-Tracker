/**
 * hackerStore.js
 * Pure data-access module for the known hacker list.
 * Swap this file to change the persistence backend (JSON → DB, etc.)
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/hackers.json');

function read() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function write(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

/** Returns all registered hackers */
function getAll() {
  return read();
}

/** Find a hacker by UUID. Returns the hacker object or null. */
function findByUUID(uuid) {
  const hackers = read();
  return hackers.find(h => h.uuid === uuid) ?? null;
}

/**
 * Add a new hacker.
 * @param {{ uuid: string, name: string, email?: string }} hacker
 * @throws if a hacker with that UUID already exists
 */
function add(hacker) {
  const hackers = read();
  if (hackers.some(h => h.uuid === hacker.uuid)) {
    throw new Error(`UUID ${hacker.uuid} is already registered`);
  }
  const record = {
    uuid: hacker.uuid,
    name: hacker.name,
    email: hacker.email || null,
    registeredAt: new Date().toISOString(),
  };
  hackers.push(record);
  write(hackers);
  return record;
}

module.exports = { getAll, findByUUID, add };
