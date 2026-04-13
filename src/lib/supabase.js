import { createClient } from '@supabase/supabase-js'

// Lazy Supabase client — only created when actually needed
let _supabase = null
let _checked = false

export function getSupabase() {
  if (_checked) return _supabase
  _checked = true

  let url = process.env.NEXT_PUBLIC_SUPABASE_URL
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Client-side: also check localStorage config
  if (typeof window !== 'undefined' && (!url || !key)) {
    try {
      const config = JSON.parse(localStorage.getItem('pf1_config') || '{}')
      if (config.supabase?.url && config.supabase?.anon_key) {
        url = config.supabase.url
        key = config.supabase.anon_key
      }
    } catch {}
  }

  if (url && key) {
    // Custom fetch: adds apikey as URL param to survive header-stripping extensions
    const customFetch = (input, init) => {
      const urlObj = new URL(typeof input === 'string' ? input : input.url)
      if (!urlObj.searchParams.has('apikey')) {
        urlObj.searchParams.set('apikey', key)
      }
      return fetch(urlObj.toString(), init)
    }

    _supabase = createClient(url, key, {
      global: { fetch: customFetch }
    })
  }
  return _supabase
}

export const supabase = null
export const isDemo = true

export const DEMO_PROPERTIES = [
  { id: '1', address: '5681 Pine Tree Dr', area: 'Beach View Sub', municipality: 'Miami Beach', sale_price: 8250000, sale_date: '2025-09-30', property_type: 'major_reno', priority: 'highest', status: 'researching', arca_rep: null, owner: '5681 INVESTMENTS LLC', entity_type: 'llc', is_developer: true, total_score: 92, permit_summary: 'SFR Alterations $1.35M (applied)', active_permits: 2, background: 'Jared Galbut — Menin Hospitality / Crescent Heights dynasty' },
  { id: '2', address: '2880 Fairgreen Dr', area: 'Fairgreen', municipality: 'Miami Beach', sale_price: 3400000, sale_date: '2025-09-22', property_type: 'teardown', priority: 'highest', status: 'researching', arca_rep: null, owner: 'STELLAR PLUTO LLC', entity_type: 'llc', is_developer: true, total_score: 88, permit_summary: 'Demolition (issued), Temp Power (issued)', active_permits: 2, background: 'David Hunt Solomon — repeat luxury flipper, Coldwell Banker' },
  { id: '3', address: '1821 W 27th St', area: 'Sunset Island II', municipality: 'Miami Beach', sale_price: 34000000, sale_date: '2025-10-14', property_type: 'teardown', priority: 'high', status: 'researching', arca_rep: null, owner: 'ABODE18 LLC', entity_type: 'llc', is_developer: true, total_score: 85, permit_summary: null, active_permits: 0, background: 'Edmond Harbour — $60.5M compound play. Maybridge Group family office' },
  { id: '4', address: '460 W Di Lido Dr', area: 'Di Lido Island', municipality: 'Miami Beach', sale_price: 8600000, sale_date: '2025-11-14', property_type: 'teardown', priority: 'high', status: 'new', arca_rep: null, owner: 'DAVID WOOD', entity_type: 'individual', is_developer: false, total_score: 72, permit_summary: null, active_permits: 0, background: 'Individual buyer. Di Lido in massive teardown cycle' },
  { id: '5', address: '6620 Allison Rd', area: 'Allison Island', municipality: 'Miami Beach', sale_price: 21000000, sale_date: '2026-01-07', property_type: 'teardown', priority: 'high', status: 'new', arca_rep: null, owner: '6620 ALLISON LLC', entity_type: 'llc', is_developer: false, total_score: 70, permit_summary: null, active_permits: 0, background: 'Charles Ratner (attorney) is LLC manager. True buyer unknown' },
  { id: '6', address: '3 Tahiti Beach Island Rd', area: 'Tahiti Beach', municipality: 'Coral Gables', sale_price: 11700000, sale_date: '2025-10-09', property_type: 'major_reno', priority: 'high', status: 'active', arca_rep: 'Brad', owner: 'ASOR03 LLC', entity_type: 'llc', is_developer: false, total_score: 68, permit_summary: null, active_permits: 0, background: 'Rosa Chapur — end user, Gables Estates area' },
  { id: '7', address: '104 Paloma Dr', area: 'Cocoplum Sec 2', municipality: 'Coral Gables', sale_price: 9000000, sale_date: '2026-02-06', property_type: 'major_reno', priority: 'high', status: 'new', arca_rep: null, owner: 'B&B 104 PALOMA LLC', entity_type: 'llc', is_developer: false, total_score: 65, permit_summary: null, active_permits: 0, background: 'Matias Pesce / Ana La Placa — Argentine investors w/ trusts' },
  { id: '8', address: '7305 Belle Meade Island Dr', area: 'Belle Meade Island', municipality: 'City of Miami', sale_price: 10560000, sale_date: '2025-12-09', property_type: 'teardown', priority: 'high', status: 'new', arca_rep: null, owner: '7305 BM ISLAND LLC', entity_type: 'llc', is_developer: false, total_score: 62, permit_summary: null, active_permits: 0, background: 'Davy Barthes — Delaware LLC, max privacy. Emre Balci connection' },
  { id: '9', address: '10300 Old Cutler Rd', area: 'Snapper Creek Lakes', municipality: 'Miami-Dade County', sale_price: 5000000, sale_date: '2025-12-27', property_type: 'teardown', priority: 'high', status: 'new', arca_rep: null, owner: '10300 OLD CUTLER ROAD LAND TRUST', entity_type: 'trust', is_developer: false, total_score: 58, permit_summary: null, active_permits: 0, background: 'Ignacio Diaz Fernandez Trust. Marketed as redevelopment' },
  { id: '10', address: '9940 W Suburban Dr', area: 'Martin Suburban Acres', municipality: 'Miami-Dade County', sale_price: 6170000, sale_date: '2025-12-17', property_type: 'unknown', priority: 'medium', status: 'new', arca_rep: null, owner: '9940 AND 1241 HOLDINGS LLC', entity_type: 'llc', is_developer: false, total_score: 45, permit_summary: null, active_permits: 0, background: 'Gustavo Lage / Beatriz Valdes-Lage. Multi-property holder' },
  { id: '11', address: '8001 Los Pinos Blvd', area: 'Cocoplum Sec 1', municipality: 'Coral Gables', sale_price: 5250000, sale_date: '2025-09-26', property_type: 'unknown', priority: 'medium', status: 'new', arca_rep: null, owner: 'JOSE A PEREZ EST OF', entity_type: 'estate', is_developer: false, total_score: 40, permit_summary: null, active_permits: 0, background: 'Estate sale. New buyer not yet reflected' },
  { id: '12', address: '8290 La Rampa St', area: 'Cocoplum Sec 1', municipality: 'Miami-Dade County', sale_price: 5830000, sale_date: '2025-11-13', property_type: 'unknown', priority: 'medium', status: 'new', arca_rep: null, owner: 'JULIO CANTILLO / LISA CANTILLO', entity_type: 'individual', is_developer: false, total_score: 38, permit_summary: null, active_permits: 0, background: 'Individual couple. End users' },
  { id: '13', address: '13032 Mar St', area: 'Gables by the Sea', municipality: 'Miami-Dade County', sale_price: 4450000, sale_date: '2025-10-17', property_type: 'unknown', priority: 'medium', status: 'new', arca_rep: null, owner: 'MICHAEL J MARTINEZ / PAMELA MARTINEZ', entity_type: 'individual', is_developer: false, total_score: 35, permit_summary: null, active_permits: 0, background: 'Individual couple. 18K SF lot' },
  { id: '14', address: '1500 NE 103rd St', area: null, municipality: 'North Miami', sale_price: 6000000, sale_date: '2025-10-31', property_type: 'unknown', priority: 'medium', status: 'new', arca_rep: null, owner: 'NOT SEARCHED', entity_type: 'unknown', is_developer: false, total_score: 30, permit_summary: null, active_permits: 0, background: 'Not yet researched' },
  { id: '15', address: '2140 Hibiscus Cir', area: null, municipality: 'North Miami', sale_price: 3300000, sale_date: '2025-12-16', property_type: 'unknown', priority: 'low', status: 'new', arca_rep: null, owner: 'NOT SEARCHED', entity_type: 'unknown', is_developer: false, total_score: 15, permit_summary: null, active_permits: 0, background: 'Lower price point' },
]
