INSERT INTO permissions (id, key, name, module_key) VALUES
 (gen_random_uuid(),'kitchen.stations.view','View kitchen station choices','kitchen')
ON CONFLICT (key) DO NOTHING;
