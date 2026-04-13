# PraskForce1

Property lead intelligence system. Scans recently sold luxury properties, monitors building permits, resolves LLC ownership, cross-references your CRM, and scores leads.

## Quick Start

```powershell
cd praskforce1
npm install
npm run dev
```

Open http://localhost:3000

Runs in demo mode with 15 pre-loaded properties from the initial research session. All configuration is stored in localStorage — no database required to get started.

## Pages

- **Pipeline** (`/`) — Ranked property leads with expandable rows showing owner intel, permit status, and background
- **Configuration** (`/settings`) — Manage portals, scan filters, 1Password, CRM integration, and notifications

## Configuration (Settings Page)

### Portals
Add, edit, enable/disable the permit portals that the system scans. Pre-configured with:
- Miami Beach Civic Access (login required)
- Coral Gables EdenWeb
- City of Miami iBuild (login required)
- Miami-Dade County
- North Miami Building Dept
- Florida Sunbiz
- Miami-Dade Property Appraiser
- PropertyReports.us (login required)

### Scan Filters
- Price floor/ceiling
- Target zip codes
- Target neighborhoods
- Permit type relevance tiers

### 1Password
Maps portal logins to 1Password vault items. Chrome agent pulls credentials securely when scanning portals that require login.

### CRM / StoneProfits
Import contractor and architect lists to cross-reference against permit filings. Flags warm leads when a known contact appears on a new permit.

### Notifications
Email alerts for new permits, new sales, and leads exceeding a score threshold.

## Going Live with Supabase

1. Create a project at supabase.com
2. Run `supabase/schema.sql` then `supabase/seed.sql` in the SQL Editor
3. Add credentials to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
   ```
4. Restart dev server

## Tech Stack
- Next.js 15 / React 19
- Tailwind CSS v4
- Supabase (Postgres + Auth + Realtime)
- 1Password (credential management for agents)
- Chrome agent (browser automation for portal scanning)
