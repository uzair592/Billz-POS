INSERT INTO permissions (id, key, name, module_key) VALUES
 (gen_random_uuid(),'orders.dinein.transfer','Transfer dine-in orders and waiter assignment','operations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system = true AND r.key = 'manager' AND p.key = 'orders.dinein.transfer'
ON CONFLICT DO NOTHING;
