# Supabase Setup

1. Create a project at https://supabase.com
2. Go to SQL Editor
3. Run schema.sql to create tables
4. Run seed.sql to load the 15 researched properties
5. Copy your project URL and anon key to .env.local

Schema includes tables for:
- properties (core property data)
- owners (LLC/entity resolution)
- permits (building permit tracking)
- contacts (people — agents, architects, contractors)
- lead_scores (computed scoring)
- scan_log (agent activity tracking)
- config (portal settings, filters — mirrors localStorage config)
