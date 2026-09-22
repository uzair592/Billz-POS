ALTER TABLE "subscription_plans"
  ADD COLUMN "max_devices" INTEGER NOT NULL DEFAULT 3;

-- The login form no longer asks for an organization slug, so identifiers must
-- resolve to exactly one account across the platform.
CREATE UNIQUE INDEX "users_username_global_unique"
  ON "users" (LOWER("username"));
CREATE UNIQUE INDEX "users_email_global_unique"
  ON "users" (LOWER("email")) WHERE "email" IS NOT NULL;

CREATE TABLE "organization_devices" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "device_hash" CHAR(64) NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "user_agent" VARCHAR(500),
  "last_ip_address" VARCHAR(64),
  "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "organization_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_devices_organization_id_device_hash_key"
  ON "organization_devices"("organization_id", "device_hash");
CREATE UNIQUE INDEX "organization_devices_id_organization_id_key"
  ON "organization_devices"("id", "organization_id");
CREATE INDEX "organization_devices_organization_id_revoked_at_idx"
  ON "organization_devices"("organization_id", "revoked_at");

ALTER TABLE "organization_devices"
  ADD CONSTRAINT "organization_devices_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD COLUMN "device_id" UUID;
CREATE INDEX "sessions_organization_id_device_id_idx"
  ON "sessions"("organization_id", "device_id");
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_device_id_organization_id_fkey"
  FOREIGN KEY ("device_id", "organization_id")
  REFERENCES "organization_devices"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_devices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "organization_devices"
  USING (
    "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR NULLIF(current_setting('app.platform_admin_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR NULLIF(current_setting('app.platform_admin_id', true), '') IS NOT NULL
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_devices" TO cafe_pos_app;
