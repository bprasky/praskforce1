// PraskForce1 — Scanner registry.
//
// Maps a scanner id (used by the API and the UI) to the scanner module
// that exports `steps` and `WORKFLOW_KEY`. The dropdown on the Leads
// page is built from this object — adding a new scanner is one line.

import * as miamiBeach from './miami-beach.js'
import * as coralGables from './coral-gables.js'
import * as miamiDade from './miami-dade.js'

export const SCANNERS = {
  miami_beach: {
    id: 'miami_beach',
    label: 'Miami Beach (Civic Access)',
    workflowKey: miamiBeach.WORKFLOW_KEY,
    portalId: miamiBeach.PORTAL_ID,
    steps: miamiBeach.steps,
    requiresLogin: true,
    credentialKey: 'mb_civic',
  },
  coral_gables: {
    id: 'coral_gables',
    label: 'Coral Gables (EdenWeb)',
    workflowKey: coralGables.WORKFLOW_KEY,
    portalId: coralGables.PORTAL_ID,
    steps: coralGables.steps,
    requiresLogin: true,
    credentialKey: 'cg_eden',
  },
  miami_dade: {
    id: 'miami_dade',
    label: 'Miami-Dade County (BNZ Permits)',
    workflowKey: miamiDade.WORKFLOW_KEY,
    portalId: miamiDade.PORTAL_ID,
    steps: miamiDade.steps,
    requiresLogin: false,
    credentialKey: null,
  },
}

export function getScanner(id) {
  return SCANNERS[id] || null
}

export function listScanners() {
  return Object.values(SCANNERS)
}
