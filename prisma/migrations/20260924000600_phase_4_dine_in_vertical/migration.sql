ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS table_id UUID;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS service_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT';

CREATE TABLE IF NOT EXISTS floor_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL,
  name VARCHAR(80) NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 2 CHECK (capacity > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id, name),
  UNIQUE (id, organization_id, branch_id),
  FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS floor_tables_scope_idx ON floor_tables(organization_id, branch_id, status);

CREATE TABLE IF NOT EXISTS kitchen_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id, name),
  UNIQUE (id, organization_id, branch_id),
  FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES pos_orders(id) ON DELETE RESTRICT,
  station_id UUID NOT NULL REFERENCES kitchen_stations(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'INITIAL',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  version INTEGER NOT NULL DEFAULT 1,
  items JSONB NOT NULL,
  created_by_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  UNIQUE (organization_id, order_id, sequence),
  FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (order_id, organization_id) REFERENCES pos_orders(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (station_id, organization_id, branch_id) REFERENCES kitchen_stations(id, organization_id, branch_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS kitchen_tickets_queue_idx ON kitchen_tickets(organization_id, branch_id, station_id, status);

CREATE TABLE IF NOT EXISTS kitchen_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL,
  ticket_id UUID NOT NULL REFERENCES kitchen_tickets(id) ON DELETE RESTRICT,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS kitchen_outbox_catchup_idx ON kitchen_outbox(organization_id, branch_id, created_at);
ALTER TABLE pos_orders ADD CONSTRAINT pos_orders_table_fk FOREIGN KEY (table_id, organization_id, branch_id) REFERENCES floor_tables(id, organization_id, branch_id) ON DELETE SET NULL;

INSERT INTO permissions (id, key, name, module_key) VALUES
 (gen_random_uuid(),'tables.view','View floor tables','operations'),
 (gen_random_uuid(),'tables.manage','Manage floor tables','operations'),
 (gen_random_uuid(),'orders.dinein.create','Open dine-in orders','operations'),
 (gen_random_uuid(),'orders.dinein.send','Send kitchen tickets','operations'),
 (gen_random_uuid(),'kitchen.tickets.view','View kitchen tickets','kitchen'),
 (gen_random_uuid(),'kitchen.tickets.ready','Mark kitchen tickets ready','kitchen'),
 (gen_random_uuid(),'orders.dinein.settle','Settle dine-in orders','pos')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE floor_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_outbox ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON floor_tables, kitchen_stations, kitchen_tickets, kitchen_outbox TO cafe_pos_runtime;
