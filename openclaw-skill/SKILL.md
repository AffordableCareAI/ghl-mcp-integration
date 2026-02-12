# GHL Integration Skill

You have access to GoHighLevel (GHL) CRM data through the MCP integration. Use this skill to manage contacts, conversations, opportunities, and monitor business metrics across insurance agency sub-accounts.

## Capabilities

### Contact Management
- **Search contacts** by name, email, phone, or tags
- **Get contact details** including custom fields, tags, notes, and activity history
- **Upsert contacts** — create new or update existing (by email/phone match)
- **Tag management** — add or remove tags for segmentation and workflow triggers
- **Task management** — view and manage contact tasks

### Conversation Management
- **Search conversations** by contact or keyword
- **Get message history** for a conversation
- **Send messages** via SMS, email, or internal notes

### Pipeline & Opportunities
- **View pipelines** and their stages
- **Search opportunities** by pipeline, stage, status, or contact
- **Move opportunities** between pipeline stages
- **Get pipeline overview** with stage counts and values

### Monitoring & Alerts
- **Stale leads** — contacts with no activity in 48+ hours
- **Missed follow-ups** — overdue tasks
- **Pipeline bottlenecks** — opportunities stuck in a stage 7+ days
- **Slow responses** — conversations with slow first response time
- **Daily digest** — summary of key metrics and alerts
- **Weekly report** — comprehensive performance review

## Usage Patterns

When Mike asks about GHL data, use the appropriate MCP tool:
- "How many leads came in today?" → `get-contacts` with date filter
- "Show me stale leads" → run `checkStaleLeads` monitor
- "Move John to proposal sent" → `update-opportunity` with stage change
- "Tag all ACA leads" → `add-tags` with contact IDs
- "What's our pipeline look like?" → `get-pipelines` + `search-opportunity`

## Important Notes
- Each MCP call = 1 GHL AI credit — batch operations when possible
- Rate limit: 100 requests per 10 seconds per location
- Always confirm destructive actions (bulk tagging, stage moves) before executing
- Use cached tool list — don't re-fetch tools/list every request
- Token format: `ENV:VAR_NAME` in config means resolve from environment variable

## Location Context
Refer to GHL_CONTEXT.md for pipeline stages, custom fields, tag taxonomy, and insurance industry specifics.
