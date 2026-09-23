INSERT INTO permissions (id, key, name, module_key)
VALUES (gen_random_uuid(), 'pos.tax.override', 'Override configured tax mode', 'pos')
ON CONFLICT (key) DO NOTHING;
