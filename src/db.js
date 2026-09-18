require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function init() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      api_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS widgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      type TEXT NOT NULL CHECK (type IN ('signup', 'cta', 'popover')),
      title TEXT NOT NULL,
      description TEXT,
      fields JSONB NOT NULL DEFAULT '[]',
      button_text TEXT NOT NULL DEFAULT 'Submit',
      display_options JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      widget_id UUID NOT NULL REFERENCES widgets(id),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      data JSONB NOT NULL,
      ip_address TEXT,
      country TEXT,
      city TEXT,
      geo_provider_used TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_widgets_tenant ON widgets (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_widget_created ON submissions (widget_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_submissions_tenant ON submissions (tenant_id);
  `);

  const { rows } = await pool.query('SELECT COUNT(*) FROM tenants');
  if (parseInt(rows[0].count) === 0) {
    await pool.query(
      `INSERT INTO tenants (name, api_key) VALUES ($1, $2), ($3, $4)`,
      ['Tenant Alpha', 'key_alpha_test123', 'Tenant Beta', 'key_beta_test456']
    );
  }
}

init();

module.exports = pool;