#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const serverScriptPath = path.join(__dirname, '../src/services/mcp/integram-server.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScriptPath],
  });

  const client = new Client(
    { name: 'metadata-getter', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  try {
    await client.connect(transport);

    await client.callTool({
      name: 'integram_authenticate',
      arguments: {
        serverURL: 'https://dronedoc.ru',
        database: 'my',
        login: 'd',
        password: 'd'
      }
    });

    console.log('Getting Workspaces table metadata (205950)...\n');
    const workspacesMetadata = await client.callTool({
      name: 'integram_get_type_metadata',
      arguments: { typeId: 205950 }
    });

    console.log('Workspaces metadata:', JSON.stringify(workspacesMetadata, null, 2));

    console.log('\n\nGetting WorkspaceSessions table metadata (205956)...\n');
    const sessionsMetadata = await client.callTool({
      name: 'integram_get_type_metadata',
      arguments: { typeId: 205956 }
    });

    console.log('WorkspaceSessions metadata:', JSON.stringify(sessionsMetadata, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
