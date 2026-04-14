// PraskForce1 — Agent Recipe Registry
// Maps task IDs (from src/lib/agent-prompts.js RUNNABLE_TASKS) to recipe modules.
// Each recipe exports { id, label, execute(ctx) }.
//
// To add a new recipe:
//   1. Create src/lib/agent-recipes/<system>.js exporting an `execute(ctx)` async fn
//   2. Import + register it below
//
// Currently implemented:
//   - SP-QUOTES-001  → StoneProfits quote extraction (DOM + Claude vision fallback)
//
// TODO (future):
//   - OL-XREF-001    → Outlook email cross-reference
//   - SCAN-PERMITS-001 → Permit portal scans (Civic Access, EdenWeb, iBuild...)
//   - SCAN-SUNBIZ-001  → Sunbiz LLC lookup
//   - SCAN-SALES-001   → PropertyReports new sales scan
//   - INTEL-BUILD-001  → Orchestrator running all of the above

import stoneprofits from '@/lib/agent-recipes/stoneprofits'

export const recipes = {
  'SP-QUOTES-001': stoneprofits,
}
