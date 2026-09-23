ALTER TABLE billing_plan_versions ADD COLUMN module_ids UUID[] NOT NULL DEFAULT '{}';
-- Empty snapshots from earlier versions preserve the organization's existing modules.
