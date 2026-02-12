# GHL MCP Integration

GoHighLevel CRM integration via MCP (Model Context Protocol) for **Claude Code** and **OpenClaw**.

```
┌──────────────┐    MCP/HTTP     ┌─────────────────────┐
│  Claude Code  │───────────────→│  GHL MCP Endpoint   │
│  (.mcp.json)  │                │  leadconnectorhq    │
└──────────────┘                └─────────────────────┘
                                          ↑
┌──────────────┐    MCP/HTTP     │
│   OpenClaw    │───────────────→│
│  (Claw agent) │                │
└──────────────┘
```

## Quick Start

### 1. Clone & Configure

```bash
git clone https://github.com/AffordableCareAI/ghl-mcp-integration.git
cd ghl-mcp-integration
cp .env.example .env
# Edit .env with your GHL PIT tokens and Location IDs
```

### 2. Claude Code (Desktop)

The `.mcp.json` is auto-detected. Verify with:
```
/mcp
```

**Fallback** (if env var substitution doesn't work — [#6204](https://github.com/anthropics/claude-code/issues/6204)):
```bash
claude mcp add --transport http ghl-main \
  --header "Authorization: Bearer $GHL_PIT_MAIN" \
  --header "locationId: $GHL_LOCATION_MAIN" \
  https://services.leadconnectorhq.com/mcp/
```

### 3. CLI Manager

```bash
# Add a location (interactive)
node cli/ghl-manager.js add

# Test connection
node cli/ghl-manager.js test main

# Generate configs for all locations
node cli/ghl-manager.js generate-config
```

### 4. OpenClaw (VPS Deployment)

```bash
# Copy skill files to VPS
scp -r openclaw-skill/ root@142.93.73.208:/root/.openclaw/skills/ghl/
scp -r shared/ root@142.93.73.208:/root/.openclaw/skills/ghl/shared/

# Set env vars on VPS
ssh root@142.93.73.208
echo 'GHL_PIT_MAIN=pit_xxx' >> /root/.openclaw/.env
echo 'GHL_LOCATION_MAIN=xxx' >> /root/.openclaw/.env

# Install monitoring crons
node /root/.openclaw/skills/ghl/cron_schedule.js --install

# Copy training docs
cp shared/GHL_CONTEXT.md /root/.openclaw/workspace/training/
cp openclaw-skill/SKILL.md /root/.openclaw/workspace/training/
```

## Architecture

### Components

| Component | Purpose |
|---|---|
| `shared/ghl-mcp-client.js` | Zero-dep MCP HTTP Streamable client |
| `shared/ghl-utils.js` | Rate limiting, caching, retries, logging |
| `shared/GHL_CONTEXT.md` | Domain context for AI agents |
| `openclaw-skill/` | Monitoring, actions, and cron for OpenClaw |
| `cli/ghl-manager.js` | Multi-location credential manager |
| `cli/encryption.js` | AES-256-GCM credential encryption |

### MCP Protocol Details

- **Transport:** HTTP Streamable (POST with JSON-RPC 2.0)
- **Endpoint:** `https://services.leadconnectorhq.com/mcp/`
- **Auth:** `Authorization: Bearer <PIT>` + `locationId: <ID>`
- **Protocol Version:** `2025-06-18`
- **Session:** Server may return `Mcp-Session-Id` header

### Rate Limits

- 100 requests per 10 seconds per location
- 200,000 requests per day per location
- Each MCP call = 1 GHL AI credit

### Available Tools (36)

**Contacts:** get-contacts, get-contact, upsert-contact, add-tags, remove-tags, get-all-tasks
**Conversations:** search-conversation, get-messages, send-a-new-message
**Opportunities:** search-opportunity, update-opportunity, get-pipelines
**Calendars:** get-calendar-events, get-appointment-notes
**Payments:** list-transactions, list-orders, get-order

## Monitoring

The monitoring system runs automated checks:

| Check | Schedule | Threshold |
|---|---|---|
| Missed follow-ups | Every 30 min | Overdue tasks |
| Stale leads | 10 AM + 3 PM weekdays | 48h no activity |
| Morning digest | Daily 8 AM | All checks |
| Weekly report | Monday 9 AM | Full review |

```bash
# Manual run
node openclaw-skill/ghl_monitor.js

# Dry run (no API calls)
node openclaw-skill/ghl_monitor.js --dry-run

# View cron schedule
node openclaw-skill/cron_schedule.js
```

## Testing

```bash
# Run all tests (zero dependencies, uses node:test)
npm test

# Individual test suites
npm run test:client
npm run test:monitor
npm run test:actions
```

## Security

- PIT tokens stored as env vars (Claude Code) or AES-256-GCM encrypted (CLI)
- PBKDF2 key derivation (100K iterations, SHA-512)
- No tokens ever committed to git
- `.env` and `*.enc` in `.gitignore`
- `ENV:VAR_NAME` prefix in OpenClaw config for env var resolution

## File Structure

```
ghl-mcp-integration/
├── .mcp.json                  # Claude Code MCP config
├── .env.example               # Token template
├── package.json               # Zero deps, node:test
├── shared/
│   ├── ghl-mcp-client.js     # MCP HTTP client
│   ├── ghl-utils.js          # Rate limiting, caching, retries
│   └── GHL_CONTEXT.md        # Insurance/GHL domain context
├── openclaw-skill/
│   ├── SKILL.md              # Agent skill definition
│   ├── ghl_actions.js        # Action functions
│   ├── ghl_monitor.js        # Monitoring checks
│   ├── cron_schedule.js      # Cron job registration
│   └── config.example.json   # Multi-location config template
├── cli/
│   ├── ghl-manager.js        # CLI location manager
│   └── encryption.js         # AES-256-GCM encryption
└── tests/
    ├── helpers/mock-fetch.js  # Fetch mock
    ├── mcp-client.test.js
    ├── monitor.test.js
    └── actions.test.js
```
