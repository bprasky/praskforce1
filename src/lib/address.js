// PraskForce1 — Address normalization
//
// Pure utility, no DB calls. Used to dedupe permit-scanner results
// against properties already in the system, and to dedupe across
// portals (Miami Beach Civic Access, Coral Gables EdenWeb,
// Miami-Dade Property Appraiser) where the same address is spelled
// differently.
//
//   "PINE TREE DR"     === "Pine Tree Drive"  === "pine tree dr."
//   "5681 Pine Tree Dr" === "5681 PINE TREE DRIVE"
//
// addressKey() is what callers should use for dedupe lookup. parseAddress()
// returns the structured shape (street, unit, normalized, key) for storage.

// Common US street suffixes. Keys are lowercase abbreviated forms (no period);
// values are the canonical full word. The normalizer compares stripped of
// trailing periods so "Dr" and "Dr." both hit the same key.
const SUFFIX_MAP = {
  st: 'street',     str: 'street',  street: 'street',
  ave: 'avenue',    av: 'avenue',   avenue: 'avenue',
  dr: 'drive',      drv: 'drive',   drive: 'drive',
  blvd: 'boulevard', boulevard: 'boulevard',
  rd: 'road',       road: 'road',
  ln: 'lane',       lane: 'lane',
  ct: 'court',      court: 'court',
  pl: 'place',      place: 'place',
  ter: 'terrace',   terr: 'terrace', terrace: 'terrace',
  cir: 'circle',    circle: 'circle',
  pkwy: 'parkway',  pky: 'parkway', parkway: 'parkway',
  hwy: 'highway',   highway: 'highway',
  way: 'way',
  trl: 'trail',     trail: 'trail',
  sq: 'square',     square: 'square',
  plz: 'plaza',     plaza: 'plaza',
  loop: 'loop',
  row: 'row',
  pass: 'pass',
  walk: 'walk',
  run: 'run',
}

// Directional words. The order in DIRECTIONAL_REGEX matters — multi-letter
// directions (NE, NW, SE, SW) must be matched before single letters so
// "NE" doesn't get split into "N E".
const DIRECTIONAL_MAP = {
  n: 'north',  no: 'north',  north: 'north',
  s: 'south',  so: 'south',  south: 'south',
  e: 'east',   east: 'east',
  w: 'west',   west: 'west',
  ne: 'northeast', northeast: 'northeast',
  nw: 'northwest', northwest: 'northwest',
  se: 'southeast', southeast: 'southeast',
  sw: 'southwest', southwest: 'southwest',
}

// Words that mark the start of a unit/apt designator. Anything from this
// keyword onward is split off as the unit and not used for the primary
// address key.
const UNIT_KEYWORDS = ['apt', 'apartment', 'unit', 'ste', 'suite', '#', 'no', 'number']

// Strip a trailing period and lowercase. Used for token comparison.
function cleanToken(t) {
  return t.replace(/\.$/, '').toLowerCase()
}

function expandToken(token) {
  const t = cleanToken(token)
  if (DIRECTIONAL_MAP[t]) return DIRECTIONAL_MAP[t]
  if (SUFFIX_MAP[t]) return SUFFIX_MAP[t]
  return t
}

// Find the index of the first unit-keyword token. Returns -1 if none.
// '#' is a special case — it can be glued to the next token (e.g. "#3")
// or stand alone, so we check for both shapes.
function findUnitStart(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i]
    const lower = cleanToken(raw)
    if (UNIT_KEYWORDS.includes(lower)) return i
    if (raw.startsWith('#')) return i
  }
  return -1
}

/**
 * Normalize a raw address string into a deterministic comparable form.
 *
 * Examples:
 *   "1234 Plant St."       → "1234 plant street"
 *   "PINE TREE DR"         → "pine tree drive"
 *   "1821 W 27th St"       → "1821 west 27th street"
 *   "460 W. Di Lido Dr."   → "460 west di lido drive"
 *   "1500 NE 103rd St"     → "1500 northeast 103rd street"
 *   "1234 Plant St Apt 4B" → "1234 plant street" (unit stripped)
 *
 * Returns the normalized PRIMARY address (no unit). Use parseAddress()
 * if you need the unit.
 */
export function normalizeAddress(raw) {
  if (!raw || typeof raw !== 'string') return ''

  // Replace commas with spaces, collapse whitespace, drop most punctuation
  // (but keep '#' so we can detect unit markers). Periods are dropped
  // entirely so "N.E." collapses to "NE" (which then expands to "northeast")
  // and "St." collapses to "St" for suffix lookup.
  const cleaned = raw
    .replace(/\./g, '')
    .replace(/,/g, ' ')
    .replace(/[^a-zA-Z0-9#\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''

  const tokens = cleaned.split(/\s+/)
  const unitIdx = findUnitStart(tokens)
  const primary = unitIdx >= 0 ? tokens.slice(0, unitIdx) : tokens

  return primary
    .map(expandToken)
    .filter(Boolean)
    .join(' ')
}

/**
 * Compute the canonical dedupe key for an address. Currently identical
 * to normalizeAddress() — kept as a separate export so callers that
 * write the key into Supabase don't have to change if we evolve the
 * key format (e.g. add a hash, strip the city).
 */
export function addressKey(raw) {
  return normalizeAddress(raw)
}

/**
 * Parse a raw address into structured fields:
 *   { street, unit, normalized, key }
 *
 *   street     — primary address string with the unit removed, original casing preserved
 *   unit       — the unit / apt / ste portion if present, else null
 *   normalized — fully normalized primary address (lowercased, suffix expanded)
 *   key        — alias of normalized; the value to use for dedupe lookups
 */
export function parseAddress(raw) {
  if (!raw || typeof raw !== 'string') {
    return { street: '', unit: null, normalized: '', key: '' }
  }

  const cleaned = raw.replace(/\s+/g, ' ').trim()
  const tokens = cleaned.split(/\s+/)
  const unitIdx = findUnitStart(tokens)

  const streetTokens = unitIdx >= 0 ? tokens.slice(0, unitIdx) : tokens
  const unitTokens = unitIdx >= 0 ? tokens.slice(unitIdx) : []

  const normalized = normalizeAddress(raw)
  return {
    street: streetTokens.join(' ').trim(),
    unit: unitTokens.length > 0 ? unitTokens.join(' ').trim() : null,
    normalized,
    key: normalized,
  }
}
