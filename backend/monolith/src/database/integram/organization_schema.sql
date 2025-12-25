-- ============================================================================
-- Organization Schema for Integram Database
-- ============================================================================
-- This schema represents the core organization metadata table in Integram DB.
-- Each organization gets its own Integram database instance with these tables.
--
-- Issue #3193 - База данных Integram для организаций
-- ============================================================================

-- Organizations table
-- Stores organization metadata and configuration
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_email VARCHAR(255) NOT NULL,
  icon TEXT,
  color VARCHAR(50),
  specification TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_organizations_owner_email ON organizations(owner_email);
CREATE INDEX idx_organizations_created_at ON organizations(created_at);

-- Comments
COMMENT ON TABLE organizations IS 'Core organization metadata and configuration';
COMMENT ON COLUMN organizations.id IS 'Unique organization identifier (UUID)';
COMMENT ON COLUMN organizations.name IS 'Organization display name';
COMMENT ON COLUMN organizations.owner_email IS 'Email of the organization owner';
COMMENT ON COLUMN organizations.icon IS 'Organization icon (emoji or URL)';
COMMENT ON COLUMN organizations.color IS 'Organization theme color (hex or name)';
COMMENT ON COLUMN organizations.specification IS 'Organization specification/description in markdown';
COMMENT ON COLUMN organizations.created_at IS 'Timestamp when organization was created';
COMMENT ON COLUMN organizations.updated_at IS 'Timestamp of last update';
