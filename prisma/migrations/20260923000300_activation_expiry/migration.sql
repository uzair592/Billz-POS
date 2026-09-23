ALTER TABLE users ADD COLUMN temporary_password_expires_at TIMESTAMPTZ(3);
UPDATE users SET temporary_password_expires_at = now() + interval '7 days' WHERE must_change_password;
REVOKE INSERT, UPDATE, DELETE ON organization_subscriptions, organization_modules FROM cafe_pos_runtime;
