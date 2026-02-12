# GHL Domain Context — Insurance Agency CRM

Reference document for AI agents (Claw/OpenClaw) interacting with GoHighLevel via MCP.

## Business Context

**Strategic AI Architects** provides AI systems to insurance agency owners (2-50+ agents).
- **Target:** Insurance agency owners scaling to $100K/month
- **Services:** AI Audits ($2,500), AI System Implementation ($8K-$25K setup), Ongoing Management ($2.5K-$7.5K/mo)
- **Insurance Lines:** ACA Health, Medicare, Life Insurance, P&C, Multiple Lines

## Pipeline Reference

### Strategic AI Audit Pipeline
| Stage | Description | Expected Duration |
|---|---|---|
| Audit Requested | Form submitted, lead qualified | 0-1 days |
| Audit In Progress | Data collection + analysis | 3-5 days |
| Audit Completed | Report ready for delivery | 1-2 days |
| Strategy Call Scheduled | Presentation meeting booked | 1-3 days |
| Proposal Sent | Audit proposal delivered | 1-7 days |
| Contract Signed | Deal closed | - |
| Closed Lost | Did not convert | - |

### AI System Implementation Pipeline
| Stage | Description | Expected Duration |
|---|---|---|
| Contract Signed | Engagement begins | 0 days |
| System Design | Architecture planning | 1-2 weeks |
| AI Training | Model training + configuration | 1-2 weeks |
| Integration & Testing | Connect systems, QA | 1-2 weeks |
| Go Live | Production deployment | 1 day |
| Optimization Phase | Tuning + monitoring | Ongoing |

## Custom Fields

### Contact Fields
- `annual_revenue` — Agency annual revenue bracket
- `team_size` — Number of agents (2-5, 6-15, 16+)
- `current_monthly_leads` — Lead volume (Under 100, 100-500, 500-1000, 1000+)
- `biggest_scaling_challenge` — Primary pain point (free text)
- `primary_goal` — What they want to achieve
- `call_outcome` — Result of strategy call (interested_in_audit, needs_nurturing, not_qualified)
- `audit_status` — Current audit progress

### Opportunity Fields
- `proposal_type` — audit, implementation, management
- `estimated_roi` — Projected return
- `implementation_timeline` — Expected duration

## Tag Taxonomy

### Lead Source Tags
- `AI-Audit-Lead`, `Revenue-Assessment`, `Referral`, `Organic`

### Lead Quality Tags
- `High-Value-Lead` — Revenue >= $3M, priority booking
- `Priority-Booking` — Fast-track scheduling
- `Qualified-Lead` — Revenue $1M-$3M, standard process
- `Standard-Booking` — Normal scheduling
- `Nurture-Lead` — Revenue < $1M, long-term nurture
- `Future-Opportunity` — Not ready yet

### Client Status Tags
- `Active-Client`, `Audit-Client`, `Implementation-Client`

### Insurance Type Tags
- `ACA-Health`, `Medicare`, `Life-Insurance`, `P-and-C`, `Multiple-Lines`

## MCP Tool Patterns

### Common Queries
```
# Find all contacts with a tag
get-contacts → filter by tag

# Get pipeline overview
get-pipelines → search-opportunity by pipelineId

# Check recent conversations
search-conversation → get-messages

# Move deal forward
update-opportunity with new stageId
```

### Batch Operations
- Tag multiple contacts: loop `add-tags` per contactId (no bulk endpoint)
- Search + act pattern: get-contacts → filter → act on each
- Pipeline analysis: get-pipelines → search-opportunity → aggregate by stage

### Credit Conservation
- Cache `tools/list` results (1 hour TTL) — saves 1 credit per call
- Batch related queries in single monitoring runs
- Use search filters to reduce result sets before processing

## Metric Benchmarks (Insurance Industry)

| Metric | Industry Average | Top Performers |
|---|---|---|
| Workflow Conversion Rate | 15% | 35% |
| Email Open Rate | 22% | 35% |
| SMS Response Rate | 8% | 18% |
| Appointment Show Rate | 75% | 85% |
| Lead-to-Customer Rate | 5% | 12% |

## Monitoring Thresholds (Defaults)

- **Stale Lead:** No activity in 48 hours
- **Stuck Opportunity:** Same pipeline stage for 7+ days
- **Slow Response:** First response time > 30 minutes
- **Missed Follow-up:** Task past due date

## GHL MCP Available Tools (36)

**Contacts:** get-contacts, get-contact, upsert-contact, add-tags, remove-tags, get-all-tasks
**Conversations:** search-conversation, get-messages, send-a-new-message
**Opportunities:** search-opportunity, update-opportunity, get-pipelines
**Calendars:** get-calendar-events, get-appointment-notes
**Payments:** list-transactions, list-orders, get-order
**Other:** email templates, blogs, social media, custom fields/values
