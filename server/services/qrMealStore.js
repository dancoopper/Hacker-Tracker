/**
 * qrMealStore.js
 * Data-access module for qr_meals.
 *
 * Table schema (create manually in Supabase):
 *   CREATE TABLE qr_meals (
 *     code          TEXT PRIMARY KEY,
 *     breakfast     INT NOT NULL DEFAULT 0,
 *     lunch         INT NOT NULL DEFAULT 0,
 *     dinner        INT NOT NULL DEFAULT 0,
 *     first_seen    TIMESTAMPTZ DEFAULT NOW(),
 *     last_updated  TIMESTAMPTZ DEFAULT NOW()
 *   );
 *
 * QR codes are arbitrary strings — not tied to RSVP_list.
 * Each meal column counts how many times that meal was recorded for the code.
 */

const supabase = require('../lib/supabase.js');

const VALID_MEALS = ['breakfast', 'lunch', 'dinner'];
const COLUMNS = 'code, breakfast, lunch, dinner, first_seen, last_updated';

/** Validate meal name. Throws if invalid. */
function assertValidMeal(meal) {
    if (!VALID_MEALS.includes(meal)) {
        throw new Error(`Invalid meal "${meal}". Must be one of: ${VALID_MEALS.join(', ')}`);
    }
}

/**
 * Find a QR code row, or create it with all counts at 0.
 * Returns the current row.
 */
async function findOrCreate(code) {
    // Upsert — insert if not exists, do nothing on conflict
    const { error: upsertError } = await supabase
        .from('qr_meals')
        .upsert([{ code }], { onConflict: 'code', ignoreDuplicates: true });

    if (upsertError) throw new Error('qrMealStore.findOrCreate upsert: ' + upsertError.message);

    const { data, error } = await supabase
        .from('qr_meals')
        .select(COLUMNS)
        .eq('code', code)
        .single();

    if (error) throw new Error('qrMealStore.findOrCreate select: ' + error.message);
    return data;
}

/**
 * Increment a specific meal column by 1.
 * Auto-creates the code row if it doesn't exist.
 * Returns the updated row.
 */
async function addMeal(code, meal) {
    assertValidMeal(meal);

    const row = await findOrCreate(code);
    const newCount = (row[meal] ?? 0) + 1;

    const { data, error } = await supabase
        .from('qr_meals')
        .update({ [meal]: newCount, last_updated: new Date().toISOString() })
        .eq('code', code)
        .select(COLUMNS)
        .single();

    if (error) throw new Error('qrMealStore.addMeal: ' + error.message);
    return data;
}

/**
 * Decrement a specific meal column by 1, floored at 0.
 * Returns the updated row, or null if the code doesn't exist.
 */
async function removeMeal(code, meal) {
    assertValidMeal(meal);

    const { data: row, error: fetchError } = await supabase
        .from('qr_meals')
        .select(COLUMNS)
        .eq('code', code)
        .maybeSingle();

    if (fetchError) throw new Error('qrMealStore.removeMeal fetch: ' + fetchError.message);
    if (!row) return null;

    const newCount = Math.max(0, (row[meal] ?? 0) - 1);

    const { data, error } = await supabase
        .from('qr_meals')
        .update({ [meal]: newCount, last_updated: new Date().toISOString() })
        .eq('code', code)
        .select(COLUMNS)
        .single();

    if (error) throw new Error('qrMealStore.removeMeal update: ' + error.message);
    return data;
}

/**
 * Returns all QR code rows, sorted newest first by last_updated.
 */
async function getAll() {
    const { data, error } = await supabase
        .from('qr_meals')
        .select(COLUMNS)
        .order('last_updated', { ascending: false });

    if (error) throw new Error('qrMealStore.getAll: ' + error.message);
    return data ?? [];
}

module.exports = { findOrCreate, addMeal, removeMeal, getAll, VALID_MEALS };
