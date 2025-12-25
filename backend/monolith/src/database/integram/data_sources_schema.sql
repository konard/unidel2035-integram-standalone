-- ============================================================================
-- Data Sources Schema for Integram Database
-- ============================================================================
-- This schema manages external data sources connected to the organization.
-- Supports multiple source types: APIs, webhooks, databases, files, etc.
--
-- Issue #3193 - База данных Integram для организаций
-- ============================================================================

-- Data Sources table
-- Stores configuration for external data connections
CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  agent_instance_id UUID,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL, -- api, webhook, database, file, telegram, email, etc.
  config JSONB,
  status VARCHAR(50) DEFAULT 'active', -- active, inactive, error
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_data_sources_organization_id ON data_sources(organization_id);
CREATE INDEX idx_data_sources_agent_instance_id ON data_sources(agent_instance_id);
CREATE INDEX idx_data_sources_type ON data_sources(type);
CREATE INDEX idx_data_sources_status ON data_sources(status);

-- Foreign key constraints (enforced at application level in Phase 0)
-- FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
-- FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE CASCADE

-- Comments
COMMENT ON TABLE data_sources IS 'External data sources connected to organization';
COMMENT ON COLUMN data_sources.id IS 'Unique data source identifier (UUID)';
COMMENT ON COLUMN data_sources.organization_id IS 'Reference to parent organization';
COMMENT ON COLUMN data_sources.agent_instance_id IS 'Optional: Agent instance using this source';
COMMENT ON COLUMN data_sources.name IS 'User-friendly name for this data source';
COMMENT ON COLUMN data_sources.type IS 'Data source type: api, webhook, database, file, telegram, email, etc.';
COMMENT ON COLUMN data_sources.config IS 'JSON configuration (credentials, endpoints, filters)';
COMMENT ON COLUMN data_sources.status IS 'Connection status: active, inactive, error';
COMMENT ON COLUMN data_sources.last_sync_at IS 'Timestamp of last successful data sync';
COMMENT ON COLUMN data_sources.created_at IS 'Timestamp when source was added';

-- Data Source Types:
--
-- 1. api - External REST/GraphQL API
--    config: { url, method, headers, auth, params }
--
-- 2. webhook - Incoming webhook endpoint
--    config: { endpoint_id, secret, allowed_ips }
--
-- 3. database - External database connection
--    config: { type (postgres/mysql/mongo), host, port, database, credentials_ref }
--
-- 4. file - File upload/import
--    config: { file_type (csv/json/xml), storage_path, schema_mapping }
--
-- 5. telegram - Telegram channel/group
--    config: { chat_id, bot_token_ref, filters }
--
-- 6. email - Email inbox monitoring
--    config: { email, imap_settings, filters }
--
-- 7. rss - RSS/Atom feed
--    config: { feed_url, polling_interval }
--
-- 8. google_sheets - Google Sheets integration
--    config: { sheet_id, credentials_ref, range }
--
-- 9. salesforce - Salesforce CRM
--    config: { instance_url, api_version, credentials_ref, objects }
--
-- 10. stripe - Stripe payment data
--     config: { api_key_ref, webhook_secret }
--
-- Note: Credentials are stored separately in organization secrets service
-- and referenced by ID, never stored directly in config.
