# Integram Database Schemas

This directory contains SQL schema definitions for the Integram database system used by each organization.

## Overview

Each organization in the DronDoc platform gets its own Integram database instance with a standard set of system tables. These schemas document the structure and purpose of each table.

**Issue Reference**: #3193 - База данных Integram для организаций

## Architecture

### Phase 0 (Current Implementation)
- **Storage**: File-based JSON storage simulating database tables
- **Location**: `backend/monolith/data/integram/{organization_id}/tables/`
- **Service**: `IntegramDatabaseService` provides abstraction layer
- **Benefits**: No external database dependencies, easy to set up and test

### Phase 1 (Future)
- **Storage**: Real Integram HTTP API with PostgreSQL backend
- **Migration**: Code will be updated to use HTTP API, file structure stays compatible
- **Zero Downtime**: Existing data can be migrated automatically

## System Tables

Each organization database contains these core tables:

### 1. Organizations (`organizations`)
**Purpose**: Core organization metadata and configuration
**Schema**: [organization_schema.sql](./organization_schema.sql)

Key fields:
- `id` - Organization UUID
- `name` - Organization display name
- `owner_email` - Owner email address
- `icon`, `color` - UI customization
- `specification` - Organization description/spec

### 2. Teams (`teams`)
**Purpose**: Team members and role-based access control
**Schema**: [teams_schema.sql](./teams_schema.sql)

Key fields:
- `organization_id` - Parent organization
- `email` - Member email (unique)
- `role` - Member role (admin, manager, member, guest)
- `status` - Invitation/activation status
- `custom_permissions` - Permission overrides

### 3. Agents (`agents`)
**Purpose**: Master list of available agent templates
**Schema**: [agent_instances_schema.sql](./agent_instances_schema.sql)

Key fields:
- `name`, `description` - Agent metadata
- `code_template` - Agent implementation code
- `config_schema` - JSON schema for configuration
- `table_schemas` - Tables this agent needs
- `version` - Agent version (semver)

### 4. Agent Instances (`agent_instances`)
**Purpose**: Deployed agent instances within organization
**Schema**: [agent_instances_schema.sql](./agent_instances_schema.sql)

Key fields:
- `organization_id` - Parent organization
- `agent_id` - Reference to agent template
- `status` - Runtime status (inactive, active, error, paused)
- `config` - Instance-specific configuration
- `custom_code` - Code overrides for this instance

### 5. Data Sources (`data_sources`)
**Purpose**: External data connections (APIs, webhooks, databases, etc.)
**Schema**: [data_sources_schema.sql](./data_sources_schema.sql)

Key fields:
- `organization_id` - Parent organization
- `type` - Source type (api, webhook, database, file, telegram, email, etc.)
- `config` - Connection configuration (credentials stored separately)
- `status` - Connection health status
- `last_sync_at` - Last successful sync timestamp

### 6. Health Checks (`health_checks`)
**Purpose**: System monitoring and alerting
**Schema**: Coming soon

Key fields:
- `organization_id` - Parent organization
- `agent_instance_id` - Optional: specific agent
- `check_type` - Check category (availability, performance, errors)
- `status` - Health status (healthy, warning, critical)
- `metrics` - Detailed metrics data

## Agent-Specific Tables

When an agent instance is created, additional tables are automatically created based on the agent's `table_schemas` definition.

**Naming Convention**: `agent_{agent_id}_{table_name}`

**Example**: If agent `abc-123` defines a table called `tasks`, the actual table will be:
```
agent_abc123_tasks
```

This ensures:
- Table isolation between agent instances
- No naming conflicts
- Easy cleanup when agent instance is deleted

## Usage Examples

### Creating an Organization Database

```javascript
import IntegramDatabaseService from './services/integram/IntegramDatabaseService.js'

const integramService = new IntegramDatabaseService()
await integramService.initialize()

// Create database with system tables
const result = await integramService.createOrganizationDatabase('org-uuid-123', {
  name: 'Acme Corp',
  owner_email: 'admin@acme.com',
  icon: '🏢',
  color: '#3B82F6'
})

console.log('Created tables:', result.systemTables)
// Output: ['organizations', 'teams', 'agents', 'agent_instances', 'data_sources', 'health_checks']
```

### Adding Team Members

```javascript
// Insert team member
await integramService.insert('org-uuid-123', 'teams', {
  organization_id: 'org-uuid-123',
  name: 'John Doe',
  email: 'john@acme.com',
  role: 'admin',
  status: 'active',
  invited_by: 'admin@acme.com'
})

// Query team members
const admins = await integramService.find('org-uuid-123', 'teams', {
  role: 'admin',
  status: 'active'
})
```

### Creating Agent Instance

```javascript
// Create agent instance
const instance = await integramService.insert('org-uuid-123', 'agent_instances', {
  organization_id: 'org-uuid-123',
  agent_id: 'telegram-parser-agent',
  instance_name: 'Main Telegram Monitor',
  status: 'active',
  config: {
    channels: ['@tech_news', '@company_updates'],
    filters: ['keyword1', 'keyword2']
  },
  created_by: 'admin@acme.com'
})

// Deploy agent tables
await integramService.deployAgentTables('org-uuid-123', 'telegram-parser-agent', [
  {
    name: 'messages',
    schema: {
      id: { type: 'uuid', primaryKey: true },
      channel: { type: 'string', required: true },
      text: { type: 'text', required: true },
      author: { type: 'string' },
      timestamp: { type: 'timestamp', default: 'now' }
    }
  }
])
```

### Adding Data Sources

```javascript
// Add Telegram data source
await integramService.insert('org-uuid-123', 'data_sources', {
  organization_id: 'org-uuid-123',
  agent_instance_id: instance.id,
  name: 'Tech News Telegram Channel',
  type: 'telegram',
  config: {
    chat_id: '@tech_news',
    bot_token_ref: 'secret-telegram-bot-token',
    filters: {
      keywords: ['AI', 'ML', 'blockchain']
    }
  },
  status: 'active'
})
```

## Migration System

The Integram service includes an automatic migration system:

1. **Initial Setup**: When organization database is created, all system tables are created automatically
2. **Schema Evolution**: New tables can be added to `SYSTEM_TABLES` in `IntegramDatabaseService.js`
3. **Agent Tables**: Dynamically created when agent instances are deployed
4. **Rollback**: Delete operations remove both metadata and tables

## Security Considerations

### Credentials Management
- **Never store credentials in table `config` fields**
- Use organization secrets service for API keys, passwords, tokens
- Reference credentials by ID: `{ api_key_ref: 'secret-id-123' }`

### Access Control
- All database operations require organization membership check
- Role-based permissions enforced at API layer
- Admin/Owner required for sensitive operations

### Data Isolation
- Each organization has completely separate database
- No cross-organization queries possible
- Clean separation ensures GDPR compliance

## API Endpoints

The organization API provides access to Integram databases:

- `POST /api/organizations` - Creates org with Integram DB
- `DELETE /api/organizations/:id` - Deletes org and Integram DB
- `GET /api/organizations/:id/database-info` - Get DB stats and info

See [organizations.js](../../api/routes/organizations.js) for full API documentation.

## Testing

Test files are located in:
- `backend/monolith/src/services/integram/__tests__/`
- `backend/monolith/src/api/routes/__tests__/`

Run tests:
```bash
cd backend/monolith
npm test -- IntegramDatabaseService
```

## Future Enhancements

### Planned Features (Phase 1+)
- [ ] Real-time subscriptions (WebSocket/SSE)
- [ ] GraphQL query interface
- [ ] Full-text search across all tables
- [ ] Time-series data optimization
- [ ] Multi-region replication
- [ ] Automated backups and point-in-time recovery
- [ ] Query performance analytics
- [ ] Schema versioning and migrations
- [ ] Data export to multiple formats

### Integration Points
- Workflow engine (store workflow definitions and execution history)
- Analytics dashboard (aggregate data from all tables)
- Audit logging (track all data changes)
- API rate limiting (per-organization quotas)

## References

- Issue #3193 - База данных Integram для организаций
- Issue #3112 - Phase 0: Infrastructure preparation
- Issue #2963 - Organization-based secret management
- [OrganizationService.js](../../services/organization/OrganizationService.js)
- [IntegramDatabaseService.js](../../services/integram/IntegramDatabaseService.js)

## Support

For questions or issues with Integram databases:
1. Check the [IntegramDatabaseService.js](../../services/integram/IntegramDatabaseService.js) implementation
2. Review test files for usage examples
3. Open an issue on GitHub with `[integram]` prefix
