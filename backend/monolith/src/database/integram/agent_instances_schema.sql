-- ============================================================================
-- Agent Instances Schema for Integram Database
-- ============================================================================
-- This schema manages agent instances deployed within an organization.
-- Each instance represents a running or configured agent with custom settings.
--
-- Issue #3193 - База данных Integram для организаций
-- ============================================================================

-- Agents table
-- Master list of available agents (templates)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon TEXT,
  category VARCHAR(100),
  color VARCHAR(50),
  code_template TEXT,
  config_schema JSONB,
  table_schemas JSONB,
  dependencies JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  version VARCHAR(50) DEFAULT '1.0.0'
);

-- Agent Instances table
-- Specific deployments of agents within an organization
CREATE TABLE IF NOT EXISTS agent_instances (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  instance_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'inactive', -- inactive, active, error, paused
  config JSONB,
  custom_code TEXT,
  last_run_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- Indexes for performance
CREATE INDEX idx_agents_category ON agents(category);
CREATE INDEX idx_agents_version ON agents(version);
CREATE INDEX idx_agent_instances_organization_id ON agent_instances(organization_id);
CREATE INDEX idx_agent_instances_agent_id ON agent_instances(agent_id);
CREATE INDEX idx_agent_instances_status ON agent_instances(status);
CREATE INDEX idx_agent_instances_created_by ON agent_instances(created_by);

-- Foreign key constraints (enforced at application level in Phase 0)
-- FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
-- FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT

-- Comments
COMMENT ON TABLE agents IS 'Master list of available agent templates';
COMMENT ON TABLE agent_instances IS 'Deployed agent instances within organizations';

COMMENT ON COLUMN agents.id IS 'Unique agent template identifier (UUID)';
COMMENT ON COLUMN agents.name IS 'Agent template name';
COMMENT ON COLUMN agents.description IS 'Agent description and capabilities';
COMMENT ON COLUMN agents.icon IS 'Agent icon (emoji or URL)';
COMMENT ON COLUMN agents.category IS 'Agent category (analytics, automation, integration, etc.)';
COMMENT ON COLUMN agents.color IS 'Agent theme color';
COMMENT ON COLUMN agents.code_template IS 'Agent code template (JavaScript/Python)';
COMMENT ON COLUMN agents.config_schema IS 'JSON schema for agent configuration';
COMMENT ON COLUMN agents.table_schemas IS 'JSON array of table schemas this agent needs';
COMMENT ON COLUMN agents.dependencies IS 'JSON array of required dependencies';
COMMENT ON COLUMN agents.version IS 'Agent template version (semver)';

COMMENT ON COLUMN agent_instances.id IS 'Unique instance identifier (UUID)';
COMMENT ON COLUMN agent_instances.organization_id IS 'Reference to parent organization';
COMMENT ON COLUMN agent_instances.agent_id IS 'Reference to agent template';
COMMENT ON COLUMN agent_instances.instance_name IS 'Custom name for this instance';
COMMENT ON COLUMN agent_instances.status IS 'Instance status: inactive, active, error, paused';
COMMENT ON COLUMN agent_instances.config IS 'JSON configuration for this instance';
COMMENT ON COLUMN agent_instances.custom_code IS 'Custom code overrides for this instance';
COMMENT ON COLUMN agent_instances.last_run_at IS 'Timestamp of last execution';
COMMENT ON COLUMN agent_instances.last_error IS 'Last error message (if status=error)';
COMMENT ON COLUMN agent_instances.created_by IS 'Email of user who created this instance';

-- Agent Instance Lifecycle:
-- 1. Created (status=inactive) - Instance configured but not running
-- 2. Activated (status=active) - Instance is running and processing
-- 3. Paused (status=paused) - Instance temporarily stopped by user
-- 4. Error (status=error) - Instance encountered an error, needs attention
--
-- When agent instance is created, tables defined in agent.table_schemas are
-- automatically created in the organization's database with naming pattern:
-- agent_{agent_id}_{table_name}
