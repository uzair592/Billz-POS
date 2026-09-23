CREATE TABLE billing_attachments (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL, invoice_id UUID NOT NULL,
 name VARCHAR(150) NOT NULL, mime_type VARCHAR(40) NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','application/pdf')),
 content BYTEA NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 2097152), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 FOREIGN KEY(invoice_id, organization_id) REFERENCES billing_invoices(id, organization_id)
);
CREATE INDEX billing_attachments_organization_id_invoice_id_idx ON billing_attachments(organization_id,invoice_id);
ALTER TABLE billing_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY attachment_isolation ON billing_attachments USING(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user='cafe_pos_platform');
GRANT SELECT ON billing_attachments TO cafe_pos_runtime;
GRANT SELECT, INSERT ON billing_attachments TO cafe_pos_platform;
REVOKE UPDATE, DELETE ON billing_attachments FROM cafe_pos_platform;
CREATE TRIGGER immutable_attachment BEFORE UPDATE OR DELETE ON billing_attachments FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
