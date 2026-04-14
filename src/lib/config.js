// PraskForce1 Configuration Manager
// Stores config in localStorage for demo mode, Supabase when connected

const CONFIG_KEY = 'pf1_config'

export const DEFAULT_CONFIG = {
  // Portals to scan for permits
  portals: [
    { id: 'mb_civic', name: 'Miami Beach Civic Access', url: 'https://eservices.miamibeachfl.gov/css/', municipality: 'Miami Beach', login_required: true, credential_key: 'Miami Beach Civic Access', enabled: true, last_scan: null },
    { id: 'cg_eden', name: 'Coral Gables EdenWeb', url: 'https://edenweb.coralgables.com/Default.asp?Build=PM.pmPermit.SearchForm&utask=normalview', municipality: 'Coral Gables', login_required: false, credential_key: null, enabled: true, last_scan: null },
    { id: 'miami_ibuild', name: 'City of Miami iBuild', url: 'https://www.miami.gov/Permits-Construction/Permitting-Resources/View-Permit-HistoryPermit-Search', municipality: 'City of Miami', login_required: true, credential_key: 'City of Miami iBuild', enabled: true, last_scan: null },
    { id: 'dade_county', name: 'Miami-Dade County', url: 'https://www.miamidade.gov/permits/', municipality: 'Miami-Dade County', login_required: false, credential_key: null, enabled: true, last_scan: null },
    { id: 'north_miami', name: 'North Miami Building Dept', url: 'https://www.northmiamifl.gov/158/Forms-Permits', municipality: 'North Miami', login_required: false, credential_key: null, enabled: false, last_scan: null },
    { id: 'sunbiz', name: 'Florida Sunbiz', url: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName', municipality: null, login_required: false, credential_key: null, enabled: true, last_scan: null },
    { id: 'property_appraiser', name: 'Miami-Dade Property Appraiser', url: 'https://www.miamidade.gov/pa/property_search.asp', municipality: null, login_required: false, credential_key: null, enabled: true, last_scan: null },
    { id: 'property_reports', name: 'PropertyReports.us', url: 'https://www.propertyreports.us/map/miami-fl', municipality: null, login_required: true, credential_key: 'PropertyReports.us', enabled: true, last_scan: null },
  ],

  // Scan filters
  filters: {
    price_floor: 3000000,
    price_ceiling: null,
    property_types: ['single_family'],
    zip_codes: ['33139', '33140', '33141', '33143', '33156', '33138', '33134', '33146'],
    neighborhoods: ['Pine Tree', 'Sunset Islands', 'Venetian Islands', 'Di Lido', 'San Marco', 'Rivo Alto', 'Belle Isle', 'Allison Island', 'La Gorce', 'Cocoplum', 'Tahiti Beach', 'Gables Estates', 'Gables by the Sea', 'Old Cutler Bay', 'Snapper Creek Lakes', 'Belle Meade', 'North Bay Road', 'Star Island', 'Hibiscus Island', 'Palm Island'],
    days_lookback: 90, // scan sales from last N days
  },

  // Permit relevance tiers
  permit_tiers: {
    tier1: { label: 'Highest Stone Opportunity', types: ['demolition', 'new_construction', 'new_sfr', 'major_remodel'], min_valuation: 500000 },
    tier2: { label: 'Good Stone Opportunity', types: ['interior_remodel', 'addition', 'pool_hardscape', 'kitchen_bath'], min_valuation: 100000 },
    tier3: { label: 'Low/No Stone', types: ['windows_doors', 'roofing', 'electrical', 'plumbing', 'mechanical', 'fence'] },
  },

  // 1Password integration
  onepassword: {
    enabled: false,
    vault_name: 'PraskForce1 Portals',
    notes: 'Store portal logins in 1Password. The Claude Chrome agent will pull credentials from this vault when scanning portals that require login.',
  },

  // CRM / StoneProfits integration
  crm: {
    enabled: false,
    type: 'stoneprofits',
    import_contractors: true,
    import_architects: true,
    import_projects: true,
    last_sync: null,
    notes: 'Export contractor/architect lists from StoneProfits as CSV and import here to cross-reference against permit data.',
    known_contractors: [],
    known_architects: [],
  },

  // Notifications
  notifications: {
    email: 'bprasky@arcaww.com',
    notify_new_permits: true,
    notify_new_sales: true,
    notify_score_threshold: 70, // only alert for leads scoring above this
    frequency: 'daily', // 'realtime', 'daily', 'weekly'
  },

  // General
  general: {
    scan_frequency: 'daily',
    auto_score: true,
    auto_sunbiz: true, // auto-run Sunbiz lookup on new LLC owners
  },

  // Outlook Integration
  outlook: {
    enabled: false,
    email: 'bprasky@arcaww.com',
    send_as: null, // optional send-as alias
    signature: 'Brad Prasky\nSenior Sales Executive\nARCA Worldwide\narcaww.com',
    notes: 'Connect your Outlook account to send outreach emails directly from PraskForce1 and log all activity automatically.',
  },

  // AI Outreach Drafting
  ai: {
    enabled: false,
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    api_key: '',
    tone: 'professional_casual',
    context: 'ARCA Worldwide is a natural stone importer based in Miami. We work with luxury residential developers, architects, and designers. We offer premium marble, limestone, travertine, porcelain, and hardwoods. Our differentiator is direct import pricing (we own quarries) and exclusive materials.',
    // Recap drafting prompt — editable per user. Empty string falls back
    // to DEFAULT_RECAP_PROMPT in src/lib/recap.js. Supports placeholders:
    // {{notes}}, {{contact}}, {{property}}, {{senderName}}
    recap_prompt_template: '',
  },

  // Supabase
  supabase: {
    url: '',
    anon_key: '',
  },
}

export function getConfig() {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Merge with defaults to pick up new fields
      return { ...DEFAULT_CONFIG, ...parsed, portals: parsed.portals || DEFAULT_CONFIG.portals, filters: { ...DEFAULT_CONFIG.filters, ...parsed.filters }, permit_tiers: { ...DEFAULT_CONFIG.permit_tiers, ...parsed.permit_tiers }, crm: { ...DEFAULT_CONFIG.crm, ...parsed.crm }, notifications: { ...DEFAULT_CONFIG.notifications, ...parsed.notifications }, general: { ...DEFAULT_CONFIG.general, ...parsed.general }, ai: { ...DEFAULT_CONFIG.ai, ...parsed.ai }, outlook: { ...DEFAULT_CONFIG.outlook, ...parsed.outlook }, supabase: { ...DEFAULT_CONFIG.supabase, ...parsed.supabase } }
    }
  } catch (e) { console.warn('Config load error:', e) }
  return DEFAULT_CONFIG
}

export function saveConfig(config) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch (e) { console.warn('Config save error:', e) }
}

export function resetConfig() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CONFIG_KEY)
  return DEFAULT_CONFIG
}
