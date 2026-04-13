// PraskForce1 — Product Targeting Engine
// Maps property value signals to ARCA product recommendations

export const PRODUCT_TIERS = {
  porcelain: {
    id: 'porcelain',
    label: 'Porcelain & Entry Woods',
    range: '$3M–$8M',
    color: '#6b7280',
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    products: ['Large-format porcelain', 'Entry-level hardwoods', 'Engineered wood', 'Porcelain pavers'],
    margin: 'standard',
  },
  entry_stone: {
    id: 'entry_stone',
    label: 'Entry Natural Stone & Stock Woods',
    range: '$8M–$12M',
    color: '#d97706',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    products: ['Travertine', 'Entry marble', 'Limestone', 'Stock hardwoods (not developer grade)', 'Natural stone pavers'],
    margin: 'good',
  },
  full_offering: {
    id: 'full_offering',
    label: 'Full Offering',
    range: '$12M+',
    color: '#dc2626',
    bg: 'bg-red-50',
    text: 'text-red-700',
    products: ['Premium marble', 'Exotic stone', 'Onyx', 'Quartzite', 'Premium hardwoods', 'Custom slabs', 'Bookmatched panels', 'Exterior cladding stone'],
    margin: 'premium',
  }
}

// Neighborhood price ceilings (based on recent comps)
// Used to estimate project budget and teardown likelihood
export const NEIGHBORHOOD_INTEL = {
  'Star Island':        { ceiling: 100000000, avg_new_build: 50000000, teardown_rate: 0.9, tier: 'full_offering' },
  'Palm Island':        { ceiling: 50000000,  avg_new_build: 25000000, teardown_rate: 0.8, tier: 'full_offering' },
  'Hibiscus Island':    { ceiling: 40000000,  avg_new_build: 20000000, teardown_rate: 0.8, tier: 'full_offering' },
  'Sunset Islands':     { ceiling: 60000000,  avg_new_build: 35000000, teardown_rate: 0.85, tier: 'full_offering' },
  'Pine Tree':          { ceiling: 30000000,  avg_new_build: 18000000, teardown_rate: 0.7, tier: 'full_offering' },
  'North Bay Road':     { ceiling: 45000000,  avg_new_build: 25000000, teardown_rate: 0.75, tier: 'full_offering' },
  'La Gorce':           { ceiling: 25000000,  avg_new_build: 15000000, teardown_rate: 0.6, tier: 'full_offering' },
  'Allison Island':     { ceiling: 30000000,  avg_new_build: 18000000, teardown_rate: 0.7, tier: 'full_offering' },
  'Di Lido Island':     { ceiling: 35000000,  avg_new_build: 20000000, teardown_rate: 0.8, tier: 'full_offering' },
  'San Marco Island':   { ceiling: 25000000,  avg_new_build: 15000000, teardown_rate: 0.75, tier: 'full_offering' },
  'Rivo Alto':          { ceiling: 25000000,  avg_new_build: 14000000, teardown_rate: 0.7, tier: 'full_offering' },
  'Belle Isle':         { ceiling: 15000000,  avg_new_build: 8000000,  teardown_rate: 0.5, tier: 'entry_stone' },
  'Venetian Islands':   { ceiling: 35000000,  avg_new_build: 20000000, teardown_rate: 0.8, tier: 'full_offering' },
  'Belle Meade Island': { ceiling: 18000000,  avg_new_build: 12000000, teardown_rate: 0.6, tier: 'full_offering' },
  'Tahiti Beach':       { ceiling: 50000000,  avg_new_build: 25000000, teardown_rate: 0.5, tier: 'full_offering' },
  'Cocoplum':           { ceiling: 20000000,  avg_new_build: 12000000, teardown_rate: 0.4, tier: 'full_offering' },
  'Gables Estates':     { ceiling: 60000000,  avg_new_build: 30000000, teardown_rate: 0.5, tier: 'full_offering' },
  'Gables by the Sea':  { ceiling: 12000000,  avg_new_build: 7000000,  teardown_rate: 0.3, tier: 'entry_stone' },
  'Snapper Creek Lakes':{ ceiling: 25000000,  avg_new_build: 15000000, teardown_rate: 0.5, tier: 'full_offering' },
  'Old Cutler Bay':     { ceiling: 20000000,  avg_new_build: 12000000, teardown_rate: 0.4, tier: 'full_offering' },
  'Journeys End':       { ceiling: 15000000,  avg_new_build: 8000000,  teardown_rate: 0.3, tier: 'entry_stone' },
  'Hammock Oaks':       { ceiling: 12000000,  avg_new_build: 7000000,  teardown_rate: 0.3, tier: 'entry_stone' },
}

// Evaluate a property and return targeting data
export function evaluateProperty(property) {
  const { sale_price, area, year_built, living_sqft, lot_sqft, property_type } = property

  // Determine product tier from sale price
  let tier_id = 'porcelain'
  if (sale_price >= 12000000) tier_id = 'full_offering'
  else if (sale_price >= 8000000) tier_id = 'entry_stone'

  const tier = PRODUCT_TIERS[tier_id]

  // Neighborhood intel
  const hood = area ? NEIGHBORHOOD_INTEL[area] || null : null

  // Teardown likelihood
  let teardown_likelihood = 0.5 // default
  if (property_type === 'teardown') teardown_likelihood = 0.95
  else if (property_type === 'major_reno') teardown_likelihood = 0.2
  else {
    // Estimate from signals
    if (hood) teardown_likelihood = hood.teardown_rate
    if (year_built && year_built < 1970) teardown_likelihood = Math.min(teardown_likelihood + 0.2, 0.95)
    if (sale_price && lot_sqft && (sale_price / lot_sqft > 500)) teardown_likelihood = Math.min(teardown_likelihood + 0.15, 0.95)
    if (living_sqft && lot_sqft && (living_sqft / lot_sqft < 0.15)) teardown_likelihood = Math.min(teardown_likelihood + 0.1, 0.95)
  }

  // Estimated project value (what they'll likely spend on the build/reno)
  let est_project_value = null
  if (hood && teardown_likelihood > 0.6) {
    est_project_value = hood.avg_new_build - sale_price
    if (est_project_value < 0) est_project_value = sale_price * 0.3 // reno estimate
  } else {
    est_project_value = sale_price * (teardown_likelihood > 0.5 ? 0.5 : 0.2)
  }

  // Stone budget estimate (typically 3-8% of project value for luxury)
  const stone_budget_low = Math.round(est_project_value * 0.03)
  const stone_budget_high = Math.round(est_project_value * 0.08)

  // Override tier if neighborhood intel says different
  if (hood && PRODUCT_TIERS[hood.tier]) {
    const hood_tier = PRODUCT_TIERS[hood.tier]
    // Use the higher of price-based or neighborhood-based tier
    const tier_order = ['porcelain', 'entry_stone', 'full_offering']
    if (tier_order.indexOf(hood.tier) > tier_order.indexOf(tier_id)) {
      tier_id = hood.tier
    }
  }

  return {
    tier: PRODUCT_TIERS[tier_id],
    tier_id,
    teardown_likelihood,
    est_project_value,
    stone_budget_low,
    stone_budget_high,
    neighborhood: hood,
    ceiling: hood?.ceiling || null,
  }
}
