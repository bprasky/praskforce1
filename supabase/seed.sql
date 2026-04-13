-- PraskForce1 — Seed Data
-- Run after schema.sql to load your 15 researched properties

insert into properties (address, city, zip, area, municipality, folio, sale_price, sale_date, year_built, bedrooms, bathrooms, living_sqft, lot_sqft, waterfront, waterfront_feet, mls_number, property_type, listing_notes, priority, arca_rep, status) values
('5681 Pine Tree Dr', 'Miami Beach', '33140', 'Beach View Sub', 'Miami Beach', '02-3214-003-0350', 8250000, '2025-09-30', 1935, 8, 7, 6458, 13072, true, 76, 'A11677135', 'major_reno', '$1.35M remodel permit filed 3/10/2026. Jared Galbut (Menin Hospitality) is the money behind this.', 'highest', null, 'researching'),
('2880 Fairgreen Dr', 'Miami Beach', '33140', 'Fairgreen', 'Miami Beach', '02-3227-002-0180', 3400000, '2025-09-22', null, null, null, null, null, true, null, null, 'teardown', 'CONFIRMED TEARDOWN. Demo permit issued 10/2025. Temp power 1/2026. David Hunt Solomon buyer/builder.', 'highest', null, 'researching'),
('1821 W 27th St', 'Miami Beach', '33140', 'Sunset Island II', 'Miami Beach', '02-3228-001-1240', 34000000, '2025-10-14', 1940, 7, 7, 6900, null, true, 150, null, 'teardown', 'COMPOUND PLAY. Edmond Harbour/Abode18 LLC. $60.5M across 2 lots. Agent: Julian Johnston (Corcoran).', 'high', null, 'researching'),
('460 W Di Lido Dr', 'Miami Beach', '33139', 'Di Lido Island', 'Miami Beach', '02-3232-011-0340', 8600000, '2025-11-14', 1956, 3, 3, 2813, 10500, true, 60, null, 'teardown', '$8.6M for 2,813 SF = buying dirt. Code violation 12/2025. David Wood individual buyer.', 'high', null, 'new'),
('6620 Allison Rd', 'Miami Beach', '33141', 'Allison Island', 'Miami Beach', '02-3211-067-0010', 21000000, '2026-01-07', 1968, 7, 7, 6549, 24774, true, null, 'A11938615', 'teardown', 'Sold in 9 days. 6620 Allison LLC — Charles Ratner is attorney gatekeeper. True buyer unknown.', 'high', null, 'new'),
('8001 Los Pinos Blvd', 'Coral Gables', '33143', 'Cocoplum Sec 1', 'Coral Gables', '03-4132-021-0490', 5250000, '2025-09-26', null, 4, 4.5, 6169, null, false, null, null, 'unknown', 'Estate sale. New buyer not yet reflected in property appraiser.', 'medium', null, 'new'),
('13032 Mar St', 'Coral Gables', '33156', 'Gables by the Sea', 'Miami-Dade County', '03-5118-013-0040', 4450000, '2025-10-17', 1977, 6, 5, 3957, 18000, true, null, 'A11811812', 'unknown', 'Michael J Martinez / Pamela A Petry Martinez. 18K SF lot.', 'medium', null, 'new'),
('3 Tahiti Beach Island Rd', 'Coral Gables', '33143', 'Tahiti Beach', 'Coral Gables', '03-4132-030-0130', 11700000, '2025-10-09', 1992, 7, 6.5, 7057, null, true, null, 'A11582262', 'major_reno', 'ASOR03 LLC — Rosa Chapur. Gated Tahiti Beach. Brad is ARCA rep.', 'high', 'Brad', 'active'),
('8290 La Rampa St', 'Coral Gables', '33143', 'Cocoplum Sec 1', 'Miami-Dade County', '03-4132-021-0050', 5830000, '2025-11-13', null, 4, 3.5, 6209, null, false, null, null, 'unknown', 'Julio Cantillo / Lisa Cantillo. Individual couple.', 'medium', null, 'new'),
('9940 W Suburban Dr', 'Coral Gables', '33156', 'Martin Suburban Acres', 'Miami-Dade County', '20-5001-009-0290', 6170000, '2025-12-17', null, null, null, null, null, false, null, null, 'unknown', '9940 AND 1241 HOLDINGS LLC — Gustavo Lage / Beatriz Valdes-Lage. Multi-property holder.', 'medium', null, 'new'),
('104 Paloma Dr', 'Coral Gables', '33143', 'Cocoplum Sec 2', 'Coral Gables', '03-4132-031-0240', 9000000, '2026-02-06', null, 7, 6.5, 6576, 19046, true, 172, 'A11871485', 'major_reno', 'B&B 104 PALOMA LLC — Matias Pesce / Ana La Placa (Argentine investors). Listed by Ashley Cusack.', 'high', null, 'new'),
('10300 Old Cutler Rd', 'Coral Gables', '33156', 'Snapper Creek Lakes', 'Miami-Dade County', '03-5107-004-0620', 5000000, '2025-12-27', null, 5, 4, 4897, 45738, false, null, null, 'teardown', 'Ignacio Diaz Fernandez Trust. 1.05 acres. Marketed as redevelopment.', 'high', null, 'new'),
('1500 NE 103rd St', 'North Miami', '33138', null, 'North Miami', '11-3205-031-0090', 6000000, '2025-10-31', null, null, null, null, null, true, null, null, 'unknown', 'Not yet researched. Call North Miami Building Dept (305) 895-9830.', 'medium', null, 'new'),
('2140 Hibiscus Cir', 'North Miami', null, null, 'North Miami', '62-2280-008-0540', 3300000, '2025-12-16', null, null, null, null, null, false, null, null, 'unknown', 'Lower price point.', 'low', null, 'new'),
('7305 Belle Meade Island Dr', 'Miami', '33138', 'Belle Meade Island', 'City of Miami', '01-3207-037-0370', 10560000, '2025-12-09', 1950, 5, 7, 5805, 22022, true, 162, 'A11798596', 'teardown', '7305 BM ISLAND LLC — Davy Barthes (Delaware). Emre Balci connection. 162ft bay frontage.', 'high', null, 'new');

-- Owners
insert into owners (property_id, entity_name, entity_type, sunbiz_doc_number, sunbiz_filing_date, sunbiz_status, principal_address, registered_agent, registered_agent_address, manager_members, background_notes, is_developer, is_repeat_buyer) values
((select id from properties where address = '5681 Pine Tree Dr'), '5681 INVESTMENTS LLC', 'llc', 'L25000405237', '2025-09-02', 'Active', '10800 Biscayne Blvd 201, Miami, FL 33161', 'GHIDOTTI BERGER LLP', '10800 Biscayne Blvd 201, Miami, FL 33161', '[{"name":"Jared Galbut","role":"MGR","address":"10800 Biscayne Blvd S.201, Miami, FL 33161"}]', 'Jared Galbut — co-founder/CEO Menin Hospitality, nephew of Russell Galbut (Crescent Heights). Matthew Greer team running development.', true, true),
((select id from properties where address = '2880 Fairgreen Dr'), 'STELLAR PLUTO LLC', 'llc', 'L25000379084', '2025-08-18', 'Active', '3454 Royal Palm Ave, Miami Beach, FL 33140', 'SOLOMON, DAVID H', '3454 Royal Palm Ave, Miami Beach, FL 33140', '[{"name":"David Solomon","role":"MANAGER","address":"3454 Royal Palm Ave, Miami Beach, FL 33140"}]', 'David Hunt Solomon — luxury agent moved to Coldwell Banker March 2026. $500M career sales. Repeat buy/build/flip.', true, true),
((select id from properties where address = '1821 W 27th St'), 'ABODE18 LLC', 'llc', 'L24000160357', '2024-04-03', 'Active', 'C/O The Maybridge Group, 777 Brickell Ave Ste 500, Miami, FL 33131', 'HARBOUR, EDMOND', '1835 W 27th Street, Miami Beach, FL 33140', '[{"name":"Matthew Mackay","role":"Director","address":"Braemar Court, St. Michael BB14017, Barbados"},{"name":"Sean Lucas","role":"Director","address":"777 Brickell Ave Ste 500, Miami, FL 33131"}]', 'Edmond Harbour — $74.6M compound play on Sunset Island II. Maybridge Group family office. Offshore structure.', true, true),
((select id from properties where address = '460 W Di Lido Dr'), 'DAVID WOOD', 'individual', null, null, null, null, null, null, null, 'Individual buyer. Di Lido Island in massive teardown cycle.', false, false),
((select id from properties where address = '6620 Allison Rd'), '6620 ALLISON LLC', 'llc', 'L25000504270', '2025-11-05', 'Active', '6620 Allison Road, Miami Beach, FL 33141', 'CHARLES RATNER, P.A.', '605 Lincoln Road, Suite 210, Miami Beach, FL 33139', '[{"name":"Charles R. Ratner","role":"MGR","address":"605 Lincoln Rd Ste 210, Miami Beach, FL 33139"}]', 'Charles Ratner is transactional RE attorney — gatekeeper, NOT actual buyer. True owner unknown.', false, false),
((select id from properties where address = '3 Tahiti Beach Island Rd'), 'ASOR03 LLC', 'llc', 'L25000436182', '2025-09-22', 'Active', '8820 Arvida Drive, Coral Gables, FL 33156', 'DUMENIGO LAW LLC', '4960 SW 72 Ave, Suite 208, Miami, FL 33155', '[{"name":"Rosa Chapur","role":"MGR","address":"8820 Arvida Dr, Coral Gables, FL 33156"}]', 'Rosa Chapur — end user, Gables Estates area. Brad is ARCA rep.', false, false),
((select id from properties where address = '104 Paloma Dr'), 'B&B 104 PALOMA LLC', 'llc', 'L26000005876', '2025-12-23', 'Active', '1770 West Flagler Street, Ste 5, Miami, FL 33135', 'PESCE, MATIAS S', '1770 West Flagler Street, Ste 5, Miami, FL 33135', '[{"name":"Matias Sebastian Pesce Trust","role":"AMBR"},{"name":"Ana Laura La Placa Trust","role":"AMBR"},{"name":"Matias S. Pesce","role":"MGR"},{"name":"Ana L. La Placa","role":"MGR"}]', 'Argentine investors using trust structures.', false, false),
((select id from properties where address = '9940 W Suburban Dr'), '9940 AND 1241 HOLDINGS LLC', 'llc', 'L25000549539', '2025-12-08', 'Active', '201 Alhambra Circle 1205, Coral Gables, FL 33134', 'LAGE, GUSTAVO D', '201 Alhambra Circle, Suite 1205, Coral Gables, FL 33134', '[{"name":"Gustavo D. Lage","role":"MGR"},{"name":"Beatriz C. Valdes-Lage","role":"AMBR"}]', 'LLC name suggests multi-property holder. Professional office address.', false, true),
((select id from properties where address = '7305 Belle Meade Island Dr'), '7305 BM ISLAND LLC', 'llc', 'M25000016913', '2025-12-04', 'Active', '480 NE 31st St, Miami, FL 33137', 'REGISTERED AGENTS INC.', '7901 4th St. N, Ste. 300, St. Petersburg, FL 33702', '[{"name":"Davy Barthes","role":"MBR","address":"480 NE 31st St, Miami, FL 33137"}]', 'Delaware LLC. Emre Balci connection — Roscommon Analytics, serial luxury buyer ($24M+).', false, true),
((select id from properties where address = '10300 Old Cutler Rd'), 'IGNACIO DIAZ FERNANDEZ TRS', 'trust', null, null, null, null, null, null, null, 'Land trust. Snapper Creek Lakes. Marketed as redevelopment.', false, false),
((select id from properties where address = '8001 Los Pinos Blvd'), 'JOSE A PEREZ EST OF', 'estate', null, null, null, null, null, null, null, 'Estate sale. New buyer unknown.', false, false),
((select id from properties where address = '13032 Mar St'), 'MICHAEL J MARTINEZ / PAMELA A PETRY MARTINEZ', 'individual', null, null, null, null, null, null, null, 'Individual couple. End users.', false, false),
((select id from properties where address = '8290 La Rampa St'), 'JULIO CANTILLO / LISA CANTILLO', 'individual', null, null, null, null, null, null, null, 'Individual couple. End users.', false, false);

-- Permits
insert into permits (property_id, permit_number, permit_type, permit_status, date_filed, valuation, scope_description, arca_tier, portal_source) values
((select id from properties where address = '5681 Pine Tree Dr'), 'BR2611509', 'Residential SFR Alterations', 'applied', '2026-03-10', 1352831, 'Interior remodeling: demo, new finishes, new MEP systems, driveway, landscape, hardscape', 1, 'miami_beach_civic'),
((select id from properties where address = '5681 Pine Tree Dr'), 'BR2511336', 'Residential Windows/Doors', 'issued', '2025-12-23', null, 'Exterior doors and window replacements', 3, 'miami_beach_civic'),
((select id from properties where address = '2880 Fairgreen Dr'), 'BR2511142', 'Residential Demolition', 'issued', '2025-10-13', null, 'Total demolition of SFR', 1, 'miami_beach_civic'),
((select id from properties where address = '2880 Fairgreen Dr'), 'ELR2605820', 'Electrical Temp Power', 'issued', '2026-01-09', null, 'Temp power for construction', 1, 'miami_beach_civic'),
((select id from properties where address = '2880 Fairgreen Dr'), 'BR2511332', 'Residential Fence', 'applied', '2025-12-22', null, 'Permanent picket fence', 3, 'miami_beach_civic');

-- Contacts
insert into contacts (name, company, role, notes, in_arca_crm, arca_relationship) values
('Julian Johnston', 'Corcoran Group', 'buyer_agent', 'Represents Edmond Harbour on Sunset Island. Gateway to the compound project.', false, 'prospect'),
('Ashley Cusack', null, 'listing_agent', 'Listed 104 Paloma Dr. Contact for buyer intro to Pesce/La Placa.', false, 'prospect'),
('David Hunt Solomon', 'Coldwell Banker Realty', 'developer', 'Repeat luxury flipper. $500M career sales. Building at 2880 Fairgreen.', false, 'prospect'),
('Charles Ratner', 'Charles Ratner, P.A.', 'attorney', 'Wharton/UM Law. RE attorney. Gatekeeper for 6620 Allison LLC buyer.', false, 'unknown'),
('Jared Galbut', 'Menin Hospitality', 'developer', 'Co-founder/CEO Menin Hospitality. Nephew of Russell Galbut. Behind 5681 Pine Tree.', false, 'prospect');

-- Lead scores
insert into lead_scores (property_id, price_score, permit_score, entity_score, relationship_score, timing_score) values
((select id from properties where address = '5681 Pine Tree Dr'), 16, 28, 20, 5, 15),
((select id from properties where address = '2880 Fairgreen Dr'), 10, 30, 18, 5, 15),
((select id from properties where address = '1821 W 27th St'), 20, 5, 20, 5, 15),
((select id from properties where address = '460 W Di Lido Dr'), 16, 5, 5, 0, 10),
((select id from properties where address = '6620 Allison Rd'), 20, 5, 10, 0, 10),
((select id from properties where address = '3 Tahiti Beach Island Rd'), 18, 5, 10, 15, 10),
((select id from properties where address = '104 Paloma Dr'), 17, 5, 10, 0, 10),
((select id from properties where address = '7305 Belle Meade Island Dr'), 17, 5, 10, 0, 8),
((select id from properties where address = '10300 Old Cutler Rd'), 12, 5, 8, 0, 8),
((select id from properties where address = '9940 W Suburban Dr'), 14, 0, 8, 0, 5),
((select id from properties where address = '8001 Los Pinos Blvd'), 12, 0, 5, 0, 5),
((select id from properties where address = '8290 La Rampa St'), 13, 0, 5, 0, 5),
((select id from properties where address = '13032 Mar St'), 11, 0, 5, 0, 5),
((select id from properties where address = '1500 NE 103rd St'), 14, 0, 0, 0, 5),
((select id from properties where address = '2140 Hibiscus Cir'), 8, 0, 0, 0, 5);
