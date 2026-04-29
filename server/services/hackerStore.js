/**
 * hackerStore.js
 * Data-access module for RSVP_list.
 * Handles both hacker lookup AND check-in state — no separate checkinStore needed.
 *
 * Assumes RSVP_list columns:
 *   id, first_name, last_name, email,
 *   checked_in (bool default false), checkin_time (timestamptz nullable),
 *   breakfast (bool), lunch (bool), dinner (bool)
 */

const supabase = require('../lib/supabase.js');

const COLUMNS = 'id, first_name, last_name, email, checked_in, checkin_time';

/** Normalize an RSVP_list row to the shape the rest of the app expects. */
function normalize(row) {
    if (!row) return null;
    return {
        uuid: row.id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email ?? null,
        checkedIn: row.checked_in ?? false,
        checkinTime: row.checkin_time ?? null,
    };
}

/** Returns all registered hackers. */
async function getAll() {
    const { data, error } = await supabase
        .from('RSVP_list')
        .select('*');
    if (error) throw new Error('hackerStore.getAll: ' + error.message);
    return (data ?? []).map(normalize);
}

/** Find a hacker by UUID. Returns the hacker object or null. */
async function findByUUID(uuid) {
    const { data, error } = await supabase
        .from('RSVP_list')
        .select(COLUMNS)
        .eq('id', uuid)
        .maybeSingle();

    if (error) throw new Error('hackerStore.findByUUID: ' + error.message);
    return normalize(data);
}

/**
 * Add a new hacker.
 * @throws if UUID already exists (Supabase unique constraint, code 23505)
 */
async function add(hacker) {
    // Split name into first/last for the DB schema
    const parts = hacker.name.trim().split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ') || '';

    const { data, error } = await supabase
        .from('RSVP_list')
        .insert([{
            id: hacker.uuid,
            first_name: firstName,
            last_name: lastName,
            email: hacker.email || null,
        }])
        .select(COLUMNS)
        .single();

    if (error) {
        if (error.code === '23505') throw new Error(`UUID ${hacker.uuid} is already registered`);
        throw new Error('hackerStore.add: ' + error.message);
    }
    return normalize(data);
}

/**
 * Mark a hacker as checked in.
 * Returns the updated record, or null if UUID not found.
 */
async function checkin(uuid) {
    const { data, error } = await supabase
        .from('RSVP_list')
        .update({ checked_in: true, checkin_time: new Date().toISOString() })
        .eq('id', uuid)
        .select(COLUMNS)
        .maybeSingle();

    if (error) throw new Error('hackerStore.checkin: ' + error.message);
    return normalize(data);
}

/**
 * Undo a check-in — resets checked_in to false and clears checkin_time.
 * Returns the updated record, or null if UUID not found.
 */
async function undoCheckin(uuid) {
    const { data, error } = await supabase
        .from('RSVP_list')
        .update({ checked_in: false, checkin_time: null })
        .eq('id', uuid)
        .select(COLUMNS)
        .maybeSingle();

    if (error) throw new Error('hackerStore.undoCheckin: ' + error.message);
    return normalize(data);
}

/** Returns all currently checked-in hackers, newest first. */
async function getAllCheckedIn() {
    const { data, error } = await supabase
        .from('RSVP_list')
        .select(COLUMNS)
        .eq('checked_in', true)
        .order('checkin_time', { ascending: false });

    if (error) throw new Error('hackerStore.getAllCheckedIn: ' + error.message);
    return (data ?? []).map(normalize);
}

module.exports = { getAll, findByUUID, add, checkin, undoCheckin, getAllCheckedIn };
