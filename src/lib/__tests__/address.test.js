// Address normalization tests.
//
// No external test runner — runs under plain Node via:
//   node src/lib/__tests__/address.test.js
//
// We use this style because the project doesn't have Jest/Vitest set up
// and the spec calls for "20+ test cases" without prescribing a runner.
// `node:test` would also work but is gated on Node 18.x+ and the
// boilerplate is heavier than necessary for a pure-function test.
//
// Cases cover:
//   - Suffix expansion (St/Str/Street, Ave/Av/Avenue, Dr/Drive, etc.)
//   - Directional expansion (N/S/E/W and NE/NW/SE/SW)
//   - Unit/apt stripping for the primary key
//   - Case + whitespace + punctuation normalization
//   - Real seed-data addresses already in the system

import { normalizeAddress, addressKey, parseAddress } from '../address.js'

let passed = 0
let failed = 0
const failures = []

function eq(actual, expected, label) {
  if (actual === expected) {
    passed++
  } else {
    failed++
    failures.push(`✗ ${label}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`)
  }
}

// ── Suffix expansion ──────────────────────────────────────────────────
eq(normalizeAddress('1234 Plant St.'),         '1234 plant street',         'St. → street')
eq(normalizeAddress('1234 Plant St'),          '1234 plant street',         'St → street')
eq(normalizeAddress('1234 Plant Street'),      '1234 plant street',         'Street stays as street')
eq(normalizeAddress('500 Ocean Ave'),          '500 ocean avenue',          'Ave → avenue')
eq(normalizeAddress('500 Ocean Avenue'),       '500 ocean avenue',          'Avenue stays as avenue')
eq(normalizeAddress('5681 Pine Tree Dr'),      '5681 pine tree drive',      'Dr → drive')
eq(normalizeAddress('5681 Pine Tree Dr.'),     '5681 pine tree drive',      'Dr. → drive')
eq(normalizeAddress('5681 PINE TREE DRIVE'),   '5681 pine tree drive',      'PINE TREE DRIVE upper → lower')
eq(normalizeAddress('100 Collins Blvd'),       '100 collins boulevard',     'Blvd → boulevard')
eq(normalizeAddress('200 Sunset Rd'),          '200 sunset road',           'Rd → road')
eq(normalizeAddress('300 Lake Ln'),            '300 lake lane',             'Ln → lane')
eq(normalizeAddress('400 Park Ct'),            '400 park court',            'Ct → court')
eq(normalizeAddress('500 Bay Pl'),             '500 bay place',             'Pl → place')
eq(normalizeAddress('600 Palm Ter'),           '600 palm terrace',          'Ter → terrace')
eq(normalizeAddress('700 Oak Cir'),            '700 oak circle',            'Cir → circle')
eq(normalizeAddress('800 Coast Pkwy'),         '800 coast parkway',         'Pkwy → parkway')
eq(normalizeAddress('900 Dixie Hwy'),          '900 dixie highway',         'Hwy → highway')
eq(normalizeAddress('1000 Some Way'),          '1000 some way',             'Way stays as way')

// ── Directional expansion ────────────────────────────────────────────
eq(normalizeAddress('1821 W 27th St'),         '1821 west 27th street',     'W → west')
eq(normalizeAddress('1821 W. 27th St.'),       '1821 west 27th street',     'W. → west')
eq(normalizeAddress('460 W Di Lido Dr'),       '460 west di lido drive',    '460 W Di Lido Dr')
eq(normalizeAddress('1500 NE 103rd St'),       '1500 northeast 103rd street', 'NE → northeast')
eq(normalizeAddress('1500 N.E. 103rd St'),     '1500 northeast 103rd street', 'N.E. variant — stripped to NE')
eq(normalizeAddress('200 SW 8th Ave'),         '200 southwest 8th avenue',  'SW → southwest')
eq(normalizeAddress('300 NW 7th St'),          '300 northwest 7th street',  'NW → northwest')
eq(normalizeAddress('400 SE 4th St'),          '400 southeast 4th street',  'SE → southeast')
eq(normalizeAddress('500 N Bay Rd'),           '500 north bay road',        'N → north')
eq(normalizeAddress('600 S Beach Dr'),         '600 south beach drive',     'S → south')
eq(normalizeAddress('700 E Flagler St'),       '700 east flagler street',   'E → east')

// ── Unit / apt stripping ─────────────────────────────────────────────
eq(normalizeAddress('1234 Plant St Apt 4B'),   '1234 plant street',         'Apt is stripped')
eq(normalizeAddress('1234 Plant St Unit 12'),  '1234 plant street',         'Unit is stripped')
eq(normalizeAddress('1234 Plant St Suite 200'),'1234 plant street',         'Suite is stripped')
eq(normalizeAddress('1234 Plant St Ste 200'),  '1234 plant street',         'Ste is stripped')
eq(normalizeAddress('1234 Plant St #4B'),      '1234 plant street',         '#4B is stripped')
eq(normalizeAddress('1234 Plant St # 4B'),     '1234 plant street',         '# 4B is stripped')

// ── Case / whitespace / punctuation ──────────────────────────────────
eq(normalizeAddress('   5681   Pine   Tree   Dr   '), '5681 pine tree drive', 'collapses whitespace')
eq(normalizeAddress('5681, Pine Tree Dr.'),    '5681 pine tree drive',      'commas dropped')
eq(normalizeAddress('PINE TREE DR'),           'pine tree drive',           'no number, all-caps')
eq(normalizeAddress(''),                       '',                          'empty string')
eq(normalizeAddress(null),                     '',                          'null input')
eq(normalizeAddress(undefined),                '',                          'undefined input')

// ── Idempotence: an already-normalized form normalizes to itself ─────
eq(normalizeAddress('5681 pine tree drive'),   '5681 pine tree drive',      'idempotent')
eq(normalizeAddress(normalizeAddress('5681 Pine Tree Dr.')), '5681 pine tree drive', 'double-normalized stable')

// ── Real seed data addresses cross-check ─────────────────────────────
// These are the actual addresses in DEMO_PROPERTIES — each must
// dedupe across portal spellings of itself.
const seedCases = [
  ['5681 Pine Tree Dr',       '5681 PINE TREE DR.'],
  ['1821 W 27th St',          '1821 West 27th Street'],
  ['460 W Di Lido Dr',        '460 W. Di Lido Drive'],
  ['6620 Allison Rd',         '6620 ALLISON ROAD'],
  ['7305 Belle Meade Island Dr', '7305 belle meade island drive'],
  ['10300 Old Cutler Rd',     '10300 OLD CUTLER ROAD'],
  ['8001 Los Pinos Blvd',     '8001 LOS PINOS BOULEVARD'],
  ['8290 La Rampa St',        '8290 LA RAMPA STREET'],
  ['1500 NE 103rd St',        '1500 N.E. 103rd Street'],
]
for (const [a, b] of seedCases) {
  eq(addressKey(a), addressKey(b), `${a} ≡ ${b}`)
}

// ── parseAddress structural shape ────────────────────────────────────
const p1 = parseAddress('1234 Plant St Apt 4B')
eq(p1.unit, 'Apt 4B', 'parseAddress: unit captured')
eq(p1.normalized, '1234 plant street', 'parseAddress: normalized strips unit')
eq(p1.key, '1234 plant street', 'parseAddress: key matches normalized')

const p2 = parseAddress('5681 Pine Tree Dr')
eq(p2.unit, null, 'parseAddress: no unit → null')
eq(p2.street, '5681 Pine Tree Dr', 'parseAddress: street keeps original casing')

// ── Report ────────────────────────────────────────────────────────────
console.log(`address.test.js — ${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const f of failures) console.log(f)
  process.exit(1)
}
