// PraskForce1 — Outreach Tracker
// Logs all contact attempts, drafts, and responses

const OUTREACH_KEY = 'pf1_outreach'

export const OUTREACH_TYPES = {
  email: { label: 'Email', icon: '📧' },
  call: { label: 'Phone Call', icon: '📞' },
  text: { label: 'Text/SMS', icon: '💬' },
  linkedin: { label: 'LinkedIn', icon: '💼' },
  instagram: { label: 'Instagram DM', icon: '📸' },
  sample_box: { label: 'Sample Box', icon: '📦' },
  in_person: { label: 'In Person', icon: '🤝' },
  showroom: { label: 'Showroom Visit', icon: '🏛️' },
}

export const OUTREACH_STATUS = {
  drafted: { label: 'Drafted', color: 'text-gray-500' },
  sent: { label: 'Sent', color: 'text-blue-600' },
  opened: { label: 'Opened', color: 'text-amber-600' },
  replied: { label: 'Replied', color: 'text-green-600' },
  meeting_set: { label: 'Meeting Set', color: 'text-purple-600' },
  no_response: { label: 'No Response', color: 'text-red-500' },
}

export function getOutreach() {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(OUTREACH_KEY) || '[]')
  } catch { return [] }
}

export function logOutreach(entry) {
  const all = getOutreach()
  const record = {
    id: `out_${Date.now()}`,
    ...entry,
    created_at: new Date().toISOString(),
  }
  all.unshift(record)
  localStorage.setItem(OUTREACH_KEY, JSON.stringify(all))
  return record
}

export function updateOutreach(id, updates) {
  const all = getOutreach()
  const idx = all.findIndex(o => o.id === id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() }
    localStorage.setItem(OUTREACH_KEY, JSON.stringify(all))
  }
  return all
}

export function getOutreachForProperty(propertyId) {
  return getOutreach().filter(o => o.property_id === propertyId)
}

export function getOutreachForContact(contactName) {
  return getOutreach().filter(o => o.contact_name === contactName)
}

// Demo outreach data
export const DEMO_OUTREACH = [
  { id: 'out_1', property_id: '1', property_address: '5681 Pine Tree Dr', contact_name: 'Matthew Greer', type: 'sample_box', status: 'sent', subject: 'Stone samples — Pine Tree Dr', notes: 'Sent via UPS. Letter from Matt Robinson. Includes porcelain + entry stone samples.', created_at: '2026-04-13T10:00:00Z' },
]
