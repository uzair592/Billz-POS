-- Grant only system defaults; customized roles are intentionally untouched.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.is_system = true
  AND r.key IN ('manager','waiter','kitchen_staff')
  AND p.key = 'kitchen.stations.view'
ON CONFLICT DO NOTHING;
