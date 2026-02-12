#!/usr/bin/env node

/**
 * GHL MCP Manager CLI
 * Manage multiple GHL locations: add, remove, list, test, generate configs, rotate tokens.
 * Credentials stored in ~/.ghl-mcp/locations.enc (AES-256-GCM encrypted).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { encrypt, decrypt } from './encryption.js';
import { createMcpClient } from '../shared/ghl-mcp-client.js';

const CONFIG_DIR = join(homedir(), '.ghl-mcp');
const CONFIG_FILE = join(CONFIG_DIR, 'locations.enc');

// ─── Helpers ────────────────────────────────────────────────

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function getPassword() {
  const pw = process.env.GHL_ENCRYPTION_PASSWORD;
  if (!pw) {
    console.error('Error: GHL_ENCRYPTION_PASSWORD environment variable not set.');
    console.error('Set it: export GHL_ENCRYPTION_PASSWORD="your-password"');
    process.exit(1);
  }
  return pw;
}

function loadLocations() {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) return {};
  const encrypted = readFileSync(CONFIG_FILE, 'utf8');
  return JSON.parse(decrypt(encrypted, getPassword()));
}

function saveLocations(locations) {
  ensureConfigDir();
  const encrypted = encrypt(JSON.stringify(locations, null, 2), getPassword());
  writeFileSync(CONFIG_FILE, encrypted, { mode: 0o600 });
}

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function redactToken(token) {
  if (!token || token.length < 12) return '***';
  return token.slice(0, 6) + '...' + token.slice(-4);
}

// ─── Commands ───────────────────────────────────────────────

async function cmdAdd() {
  console.log('➕ Add GHL Location\n');

  const name = await prompt('Location name (e.g., AffordableCareGroup): ');
  const alias = await prompt('Alias (short, e.g., main): ');
  const locationId = await prompt('GHL Location ID: ');
  const token = await prompt('GHL Private Integration Token (PIT): ');

  if (!name || !alias || !locationId || !token) {
    console.error('All fields are required.');
    process.exit(1);
  }

  const locations = loadLocations();

  if (locations[alias]) {
    const overwrite = await prompt(`Location '${alias}' already exists. Overwrite? (y/N): `);
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }
  }

  locations[alias] = { name, alias, locationId, token, addedAt: new Date().toISOString() };
  saveLocations(locations);
  console.log(`\n✅ Location '${alias}' (${name}) saved.`);
}

async function cmdRemove() {
  const alias = process.argv[3];
  if (!alias) {
    console.error('Usage: ghl-manager remove <alias>');
    process.exit(1);
  }

  const locations = loadLocations();
  if (!locations[alias]) {
    console.error(`Location '${alias}' not found.`);
    process.exit(1);
  }

  const confirm = await prompt(`Remove location '${alias}' (${locations[alias].name})? (y/N): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return;
  }

  delete locations[alias];
  saveLocations(locations);
  console.log(`✅ Location '${alias}' removed.`);
}

function cmdList() {
  const locations = loadLocations();
  const entries = Object.values(locations);

  if (entries.length === 0) {
    console.log('No locations configured. Run: node ghl-manager.js add');
    return;
  }

  console.log('📍 GHL Locations\n');
  console.log('Alias'.padEnd(15) + 'Name'.padEnd(30) + 'Location ID'.padEnd(28) + 'Token'.padEnd(15) + 'Added');
  console.log('─'.repeat(100));

  for (const loc of entries) {
    console.log(
      loc.alias.padEnd(15) +
      loc.name.padEnd(30) +
      loc.locationId.padEnd(28) +
      redactToken(loc.token).padEnd(15) +
      (loc.addedAt ? new Date(loc.addedAt).toLocaleDateString() : 'unknown')
    );
  }
}

async function cmdTest() {
  const alias = process.argv[3];
  if (!alias) {
    console.error('Usage: ghl-manager test <alias>');
    process.exit(1);
  }

  const locations = loadLocations();
  const loc = locations[alias];
  if (!loc) {
    console.error(`Location '${alias}' not found.`);
    process.exit(1);
  }

  console.log(`🔌 Testing connection to '${alias}' (${loc.name})...\n`);

  try {
    const client = createMcpClient({
      token: loc.token,
      locationId: loc.locationId,
    });

    const { capabilities, serverInfo } = await client.initialize();
    console.log('✅ Connected!');
    console.log(`   Server: ${serverInfo?.name || 'unknown'} v${serverInfo?.version || '?'}`);

    const tools = await client.listTools();
    const toolList = tools?.tools || [];
    console.log(`   Tools available: ${toolList.length}`);

    if (toolList.length > 0) {
      console.log('\n   Tool categories:');
      const categories = {};
      for (const tool of toolList) {
        const cat = tool.name.split('-')[0] || 'other';
        categories[cat] = (categories[cat] || 0) + 1;
      }
      for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
        console.log(`     ${cat}: ${count}`);
      }
    }

    await client.close();
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
    process.exit(1);
  }
}

function cmdGenerateConfig() {
  const locations = loadLocations();
  const entries = Object.values(locations);

  if (entries.length === 0) {
    console.error('No locations to generate config for. Run: node ghl-manager.js add');
    process.exit(1);
  }

  console.log('📝 Generating configuration files...\n');

  // .mcp.json for Claude Code
  const mcpConfig = { mcpServers: {} };
  for (const loc of entries) {
    mcpConfig.mcpServers[`ghl-${loc.alias}`] = {
      type: 'http',
      url: 'https://services.leadconnectorhq.com/mcp/',
      headers: {
        Authorization: `Bearer \${GHL_PIT_${loc.alias.toUpperCase()}}`,
        locationId: `\${GHL_LOCATION_${loc.alias.toUpperCase()}}`,
        'MCP-Protocol-Version': '2025-06-18',
      },
    };
  }

  console.log('── .mcp.json ──');
  console.log(JSON.stringify(mcpConfig, null, 2));

  // .env template
  console.log('\n── .env ──');
  for (const loc of entries) {
    const prefix = loc.alias.toUpperCase();
    console.log(`GHL_PIT_${prefix}=${loc.token}`);
    console.log(`GHL_LOCATION_${prefix}=${loc.locationId}`);
  }

  // openclaw-skill/config.json
  const skillConfig = { locations: {}, monitoring: {}, notifications: {} };
  for (const loc of entries) {
    skillConfig.locations[loc.alias] = {
      name: loc.name,
      alias: loc.alias,
      token: `ENV:GHL_PIT_${loc.alias.toUpperCase()}`,
      locationId: `ENV:GHL_LOCATION_${loc.alias.toUpperCase()}`,
      thresholds: { stale_lead_hours: 48, stuck_opportunity_days: 7, slow_response_minutes: 30 },
    };
  }

  console.log('\n── openclaw-skill/config.json ──');
  console.log(JSON.stringify(skillConfig, null, 2));
}

async function cmdRotateToken() {
  const alias = process.argv[3];
  if (!alias) {
    console.error('Usage: ghl-manager rotate-token <alias>');
    process.exit(1);
  }

  const locations = loadLocations();
  if (!locations[alias]) {
    console.error(`Location '${alias}' not found.`);
    process.exit(1);
  }

  console.log(`🔄 Rotate token for '${alias}' (${locations[alias].name})\n`);
  console.log(`   Current token: ${redactToken(locations[alias].token)}`);

  const newToken = await prompt('New PIT token: ');
  if (!newToken) {
    console.log('Cancelled.');
    return;
  }

  locations[alias].token = newToken;
  locations[alias].tokenRotatedAt = new Date().toISOString();
  saveLocations(locations);

  console.log(`\n✅ Token rotated for '${alias}'.`);
  console.log('   Remember to update .env files and VPS environment variables.');
}

function cmdHelp() {
  console.log(`
GHL MCP Manager — Manage GoHighLevel locations for MCP integration

Usage: node ghl-manager.js <command> [args]

Commands:
  add                  Add a new GHL location (interactive)
  remove <alias>       Remove a location
  list                 Show all configured locations
  test <alias>         Test MCP connection to a location
  generate-config      Generate .mcp.json, .env, and skill config
  rotate-token <alias> Update a location's PIT token
  help                 Show this help message

Environment:
  GHL_ENCRYPTION_PASSWORD   Password for encrypting stored credentials

Config: ~/.ghl-mcp/locations.enc (AES-256-GCM encrypted)
`);
}

// ─── CLI Router ─────────────────────────────────────────────
const command = process.argv[2] || 'help';

switch (command) {
  case 'add': await cmdAdd(); break;
  case 'remove': await cmdRemove(); break;
  case 'list': cmdList(); break;
  case 'test': await cmdTest(); break;
  case 'generate-config': cmdGenerateConfig(); break;
  case 'rotate-token': await cmdRotateToken(); break;
  case 'help': case '--help': case '-h': cmdHelp(); break;
  default:
    console.error(`Unknown command: ${command}`);
    cmdHelp();
    process.exit(1);
}
