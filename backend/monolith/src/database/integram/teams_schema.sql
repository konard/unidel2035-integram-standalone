-- ============================================================================
-- Teams Schema for Integram Database
-- ============================================================================
-- This schema manages team members (users) within an organization.
-- Supports role-based access control and invitation workflows.
--
-- Issue #3193 - База данных Integram для организаций
-- ============================================================================

-- Teams table
-- Stores organization team members with their roles and status
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL, -- admin, manager, member, guest
  status VARCHAR(50) DEFAULT 'invited', -- invited, active, suspended
  joined_at TIMESTAMP DEFAULT NOW(),
  invited_by VARCHAR(255),
  custom_permissions JSONB
);

-- Indexes for performance
CREATE INDEX idx_teams_organization_id ON teams(organization_id);
CREATE INDEX idx_teams_email ON teams(email);
CREATE INDEX idx_teams_role ON teams(role);
CREATE INDEX idx_teams_status ON teams(status);

-- Foreign key constraints (enforced at application level in Phase 0)
-- FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE

-- Comments
COMMENT ON TABLE teams IS 'Team members within an organization';
COMMENT ON COLUMN teams.id IS 'Unique team member identifier (UUID)';
COMMENT ON COLUMN teams.organization_id IS 'Reference to parent organization';
COMMENT ON COLUMN teams.name IS 'Member display name';
COMMENT ON COLUMN teams.email IS 'Member email address (unique across platform)';
COMMENT ON COLUMN teams.role IS 'Member role: admin, manager, member, guest';
COMMENT ON COLUMN teams.status IS 'Member status: invited, active, suspended';
COMMENT ON COLUMN teams.joined_at IS 'Timestamp when member joined';
COMMENT ON COLUMN teams.invited_by IS 'Email of the user who invited this member';
COMMENT ON COLUMN teams.custom_permissions IS 'JSON object with custom permission overrides';

-- Role hierarchy (higher level = more permissions):
-- admin > manager > member > guest
--
-- Permissions by role:
-- - admin: Full control, can manage members, agents, and organization settings
-- - manager: Can manage agents and workflows, view all data
-- - member: Can use agents, view own data
-- - guest: Read-only access to shared data
