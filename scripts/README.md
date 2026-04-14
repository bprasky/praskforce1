# PraskForce1 Background Runner

This is the piece that turns PraskForce1 from a copy-paste workflow into a real
automated system. It polls the `agent_jobs` table in Supabase for queued work
and dispatches each job to a handler — portal scans, IG rundowns, StoneProfits
quotes, etc.

## Discovery vs Enrichment: how the portals are actually used

The permit portals in this system serve two very different purposes,
and you should keep them straight or the scrapers will do the wrong
thing:

**Discovery sources** are firehoses that surface NEW addresses:
  - `zillow_sold`: recent sales in a geographic area
  - `property_reports`: recent transactions via PropertyReports.us (paid)

Discovery scrapers run on a schedule (overnight, e.g.) and return a
list of new candidate properties with address + price. These get
written to the permits table as "Recent Sale" rows and surface in
the Leads page.

**Enrichment sources** are LOOKUP tools, not search tools. Given a
known address, they return permit/ownership data about that specific
address. You cannot ask them "give me all permits filed this week"
— the municipal portals simply don't work that way.
  - `mb_civic`: Miami Beach Civic Access permit lookup
  - `cg_eden`: Coral Gables EdenWeb
  - `miami_ibuild`: City of Miami iBuild
  - `dade_county`: Miami-Dade County ePermitting

Enrichment scrapers run on-demand against a list of target addresses,
not on a fixed schedule.

**Research sources** are even more specialized — Property Appraiser
for ownership history, Sunbiz for LLC/officer lookups. They run as
part of enrichment against a known entity or address.

## Current state

- **Portal scan handler**: real. Dispatches to per-portal Playwright scrapers
  registered in `scripts/scrapers/index.js`. Active scrapers:
  - `zillow_sold` (discovery, public) — diagnostic first pass
  - `property_reports` (discovery, credentialed) — diagnostic first pass
  - `dade_county` (enrichment, public) — diagnostic first pass
  All three dump screenshots + HTML to `scripts/scrapers/.debug/` on every
  run so we can iterate against real portal output. Portals without a
  registered scraper are marked "skipped" and fall back to the
  Claude-in-Chrome copy-paste flow on `/leads`.
- **IG daily scroll, SP quote, Outlook recap handlers**: stubs. These need
  Playwright + per-portal login flows. See the TODO comments in `runner.js`.

The dispatch loop, job claiming (with race protection), error handling, and
result writing are all complete. Run the daemon alongside the web app and
queued scan jobs will be picked up within ~5 seconds.

## Playwright setup

The runner uses Playwright to drive real browsers. After pulling the branch:

```bash
npm install                      # installs playwright as a devDep
npx playwright install chromium  # downloads the browser binary (~300MB, one-time)
```

The repo has a `postinstall` hook that runs `playwright install chromium`
automatically, so a fresh `npm install` should take care of it. If you want
to skip the browser download on CI or slow machines, set
`PF1_SKIP_PLAYWRIGHT=1` and the postinstall becomes a no-op.

To run the scraper in visible (non-headless) mode for debugging:
```bash
PF1_HEADLESS=0 node scripts/runner.js
```

## Prerequisites

1. **Supabase connected.** The runner reads and writes `agent_jobs` directly
   from a Node process — it cannot use the localStorage fallback the web app
   uses. Connect Supabase in Configuration → Database and run the schema from
   `supabase/schema.sql` (see main README for the SQL blocks that need to be
   applied).
2. **Service role key.** The runner uses the service role key, not the anon
   key, because it needs to bypass row-level security. Get it from Supabase
   Dashboard → Project Settings → API → `service_role` (secret). Never commit
   this key or ship it to the browser.

## Running it locally

```bash
# One-shot: process all queued jobs and exit
export NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
node scripts/runner.js

# Daemon mode: poll every 60s, keep running
node scripts/runner.js --daemon

# Limit to one kind of job (useful for targeted retries)
node scripts/runner.js --kind portal_scan
```

## Running it on a schedule

There are three reasonable options. The repo includes a GitHub Actions
workflow for the most universal one.

### Option 1: GitHub Actions (recommended to start)

See `.github/workflows/portal-sync.yml`. Runs the script on a cron schedule
(default: every hour). To enable:

1. In the repo on GitHub, add two secrets under Settings → Secrets and
   variables → Actions:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. The workflow triggers automatically on schedule, and you can manually
   trigger a run from the Actions tab with `workflow_dispatch`.
3. Logs appear in the Actions tab.

Good for: running without any servers, simple credential management, cheap
(free for public repos, generous minutes for private).

### Option 2: Local cron on your Mac/Windows machine

```bash
# Mac — edit crontab
crontab -e
# Add (runs every hour on the top of the hour):
0 * * * * cd /path/to/praskforce1 && NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/runner.js >> /tmp/pf1-runner.log 2>&1
```

Good for: running with local 1Password integration, fastest iteration on
credentialed portals, no need to ship secrets to GitHub.

### Option 3: Always-on daemon on a small VM

```bash
# systemd unit file — /etc/systemd/system/pf1-runner.service
[Unit]
Description=PraskForce1 Background Runner
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/praskforce1
Environment=NEXT_PUBLIC_SUPABASE_URL=https://...
Environment=SUPABASE_SERVICE_ROLE_KEY=eyJ...
ExecStart=/usr/bin/node scripts/runner.js --daemon
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Good for: low-latency job pickup, running through credentials vaults accessible
to the VM, handling background jobs more aggressively.

## Adding a new portal scraper

Each scraper is a single file under `scripts/scrapers/<portal-name>.js` that
exports a function matching this contract:

```js
async function scrapeFoo({ filters, logger }) {
  // ... Playwright work ...
  return {
    portal_id: 'foo_portal',       // must match config.portals[].id
    status: 'success' | 'partial' | 'failed' | 'skipped',
    permits_found: number,
    new_permits: number,
    summary: string | null,
    error: string | null,
    permits: [{                    // one entry per new permit
      portal_id: 'foo_portal',
      permit_number: '...',
      permit_type: '...',
      permit_status: '...',
      date_filed: '2026-04-01',
      valuation: 1350000,
      scope_description: '...',
      contractor_name: '...',
      address: '...',              // goes into raw_data.address
      raw_link: '...',              // permit detail URL
    }],
  }
}

module.exports = { scrapeFoo }
```

Then:

1. **Register it** in `scripts/scrapers/index.js` under the right `portal_id`
   key.
2. **Mirror it** on the web side — add the `portal_id` to
   `src/lib/scraper-registry.js:AUTO_SCRAPER_PORTAL_IDS` so the UI flips
   that portal's badge from "MANUAL" to "AUTO" and skips the copy-paste
   prompt when it's the target.
3. Done — the runner and UI pick it up automatically.

**For credentialed portals** (Miami Beach Civic, City of Miami iBuild,
PropertyReports), read credentials from environment variables with
these exact names:

```
PF1_PROPERTY_REPORTS_USERNAME / PF1_PROPERTY_REPORTS_PASSWORD
PF1_MB_CIVIC_USERNAME         / PF1_MB_CIVIC_PASSWORD
PF1_MIAMI_IBUILD_USERNAME     / PF1_MIAMI_IBUILD_PASSWORD
```

Put them in `.env.local` in the repo root (gitignored) for local runs:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PF1_PROPERTY_REPORTS_USERNAME=brad@...
PF1_PROPERTY_REPORTS_PASSWORD=...
```

Node doesn't auto-load `.env.local` — either:

1. Use `dotenv-cli`: `npx dotenv -e .env.local -- node scripts/runner.js`
2. Or in PowerShell, source it manually:
   ```powershell
   Get-Content .env.local | ForEach-Object {
     if ($_ -match '^([^=#]+)=(.*)$') { $env:($matches[1].Trim()) = $matches[2].Trim() }
   }
   node scripts/runner.js
   ```
3. Or pass them inline on the command line (not recommended — shows in history).

For GitHub Actions runs, add each as a repo secret under
Settings → Secrets and variables → Actions, then reference them in the
workflow `env:` block.

## The diagnostic pattern (for iterating on a new scraper)

First-pass scrapers should dump screenshots and HTML to
`scripts/scrapers/.debug/` so you can see what the portal actually looks
like when Playwright opens it. The Miami-Dade scraper is the template — look
at `dumpPage()` in that file. This directory is gitignored.

After a diagnostic run:
1. Look at `scripts/scrapers/.debug/miami-dade-landing-*.png` to see the
   real page layout
2. Look at `miami-dade-landing-*.html` to find the selectors you need
3. Tighten `miami-dade.js` to use those selectors
4. Re-run — the debug dir fills with more iterations, easy to diff

## Safety notes

- **Service role key has full DB access.** Treat it like a password. Never
  commit it. Never log it. Use GitHub Actions secrets or a local `.env` file
  (already gitignored).
- **Claim-before-run race protection.** The claim query uses
  `eq('status', 'queued')` as a guard, so two runners can't pick up the same
  job. If you run the daemon and GHA simultaneously, at most one will win
  each job.
- **Failed jobs stay failed.** The runner doesn't auto-retry. If a scrape
  fails, the job is marked `failed` with the error message. Fix it and re-
  queue from the web UI (the Pipeline/Leads page has retry buttons).
- **Idempotency.** The permits upsert uses
  `(portal_source, permit_number)` as the dedup key, so re-running a scan
  over the same day won't create duplicate permit rows. Scan runs on the
  `scan_log` table are always appended though — that's the audit trail.
