/**
 * GHL Monitoring Checks
 * Detects stale leads, missed follow-ups, pipeline bottlenecks, and slow responses.
 * Outputs structured summaries for OpenClaw to relay via Telegram.
 */

import { createActions } from './ghl_actions.js';
import { log, timeAgo, resolveEnvValue } from '../shared/ghl-utils.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load location config, resolving ENV: prefixed values.
 * @param {string} [configPath]
 * @returns {object}
 */
function loadConfig(configPath) {
  const path = configPath || join(__dirname, 'config.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Check for stale leads — contacts with no activity in threshold hours.
 */
async function checkStaleLeads(actions, config) {
  const threshold = config.thresholds?.stale_lead_hours || 48;
  const cutoff = new Date(Date.now() - threshold * 3600_000).toISOString();

  log('info', 'Checking stale leads', { threshold, cutoff });

  const result = await actions.searchContacts('', { limit: 100 });
  const contacts = parseContent(result);

  const stale = (contacts?.contacts || []).filter(c => {
    const lastActivity = c.lastActivity || c.dateUpdated || c.dateAdded;
    return lastActivity && new Date(lastActivity) < new Date(cutoff);
  });

  return {
    check: 'stale_leads',
    count: stale.length,
    threshold: `${threshold}h`,
    items: stale.slice(0, 10).map(c => ({
      id: c.id,
      name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || c.phone,
      lastActivity: timeAgo(c.lastActivity || c.dateUpdated || c.dateAdded),
      tags: c.tags || [],
    })),
    hasMore: stale.length > 10,
  };
}

/**
 * Check for missed follow-ups — overdue tasks.
 */
async function checkMissedFollowups(actions, config) {
  log('info', 'Checking missed follow-ups');

  // Get contacts then check tasks
  const result = await actions.searchContacts('', { limit: 50 });
  const contacts = parseContent(result);

  const overdue = [];
  const now = new Date();

  for (const contact of (contacts?.contacts || []).slice(0, 20)) {
    try {
      const tasks = await actions.getContactTasks(contact.id);
      const tasksData = parseContent(tasks);

      for (const task of (tasksData?.tasks || [])) {
        if (task.dueDate && new Date(task.dueDate) < now && !task.completed) {
          overdue.push({
            contactId: contact.id,
            contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            taskTitle: task.title || task.body,
            dueDate: timeAgo(task.dueDate),
          });
        }
      }
    } catch {
      // Skip contacts with task fetch errors
    }
  }

  return {
    check: 'missed_followups',
    count: overdue.length,
    items: overdue.slice(0, 10),
    hasMore: overdue.length > 10,
  };
}

/**
 * Check for pipeline bottlenecks — opportunities stuck in a stage for N+ days.
 */
async function checkPipelineBottlenecks(actions, config) {
  const stuckDays = config.thresholds?.stuck_opportunity_days || 7;
  const cutoff = new Date(Date.now() - stuckDays * 86_400_000);

  log('info', 'Checking pipeline bottlenecks', { stuckDays });

  const pipelinesResult = await actions.getPipelines();
  const pipelinesData = parseContent(pipelinesResult);

  const bottlenecks = [];

  for (const pipeline of (pipelinesData?.pipelines || []).slice(0, 3)) {
    const oppsResult = await actions.searchOpportunities({ pipelineId: pipeline.id });
    const oppsData = parseContent(oppsResult);

    const stageGroups = {};
    for (const opp of (oppsData?.opportunities || [])) {
      const stageDate = opp.lastStageChangeAt || opp.updatedAt || opp.createdAt;
      if (stageDate && new Date(stageDate) < cutoff) {
        const stageName = pipeline.stages?.find(s => s.id === opp.pipelineStageId)?.name || opp.pipelineStageId;
        if (!stageGroups[stageName]) stageGroups[stageName] = [];
        stageGroups[stageName].push({
          id: opp.id,
          name: opp.name || opp.contactName,
          value: opp.monetaryValue,
          stuckSince: timeAgo(stageDate),
        });
      }
    }

    for (const [stage, opps] of Object.entries(stageGroups)) {
      if (opps.length > 0) {
        bottlenecks.push({
          pipeline: pipeline.name,
          stage,
          count: opps.length,
          totalValue: opps.reduce((sum, o) => sum + (o.value || 0), 0),
          items: opps.slice(0, 5),
        });
      }
    }
  }

  return {
    check: 'pipeline_bottlenecks',
    count: bottlenecks.reduce((sum, b) => sum + b.count, 0),
    threshold: `${stuckDays}d`,
    bottlenecks,
  };
}

/**
 * Check for slow first responses — conversations where first response took too long.
 */
async function checkSlowResponses(actions, config) {
  const thresholdMin = config.thresholds?.slow_response_minutes || 30;

  log('info', 'Checking slow responses', { thresholdMin });

  const result = await actions.searchContacts('', { limit: 30 });
  const contacts = parseContent(result);

  const slow = [];

  for (const contact of (contacts?.contacts || []).slice(0, 15)) {
    try {
      const history = await actions.getConversationHistory(contact.id, { limit: 5 });
      const messages = parseContent(history);

      const msgList = messages?.messages || [];
      if (msgList.length < 2) continue;

      // Find first inbound and first outbound
      const firstInbound = msgList.find(m => m.direction === 'inbound');
      const firstOutbound = msgList.find(m => m.direction === 'outbound' && firstInbound &&
        new Date(m.dateAdded) > new Date(firstInbound.dateAdded));

      if (firstInbound && firstOutbound) {
        const responseMs = new Date(firstOutbound.dateAdded) - new Date(firstInbound.dateAdded);
        const responseMin = responseMs / 60_000;
        if (responseMin > thresholdMin) {
          slow.push({
            contactId: contact.id,
            contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            responseTime: `${Math.round(responseMin)}m`,
            threshold: `${thresholdMin}m`,
          });
        }
      }
    } catch {
      // Skip
    }
  }

  return {
    check: 'slow_responses',
    count: slow.length,
    threshold: `${thresholdMin}m`,
    items: slow.slice(0, 10),
  };
}

/**
 * Run all monitoring checks and return a formatted summary.
 */
async function runAllChecks(config, locationAlias = 'main') {
  const locationConfig = config.locations?.[locationAlias];
  if (!locationConfig) throw new Error(`Location '${locationAlias}' not found in config`);

  const actions = createActions(locationConfig);

  try {
    const [stale, followups, bottlenecks, responses] = await Promise.allSettled([
      checkStaleLeads(actions, locationConfig),
      checkMissedFollowups(actions, locationConfig),
      checkPipelineBottlenecks(actions, locationConfig),
      checkSlowResponses(actions, locationConfig),
    ]);

    const results = {
      timestamp: new Date().toISOString(),
      location: locationConfig.name,
      checks: {
        staleLeads: stale.status === 'fulfilled' ? stale.value : { check: 'stale_leads', error: stale.reason?.message },
        missedFollowups: followups.status === 'fulfilled' ? followups.value : { check: 'missed_followups', error: followups.reason?.message },
        pipelineBottlenecks: bottlenecks.status === 'fulfilled' ? bottlenecks.value : { check: 'pipeline_bottlenecks', error: bottlenecks.reason?.message },
        slowResponses: responses.status === 'fulfilled' ? responses.value : { check: 'slow_responses', error: responses.reason?.message },
      },
    };

    results.summary = formatSummary(results);
    return results;
  } finally {
    await actions.close();
  }
}

/**
 * Format check results into a human-readable summary for Telegram.
 */
function formatSummary(results) {
  const { checks } = results;
  const lines = [`📊 GHL Monitor — ${results.location}`, `🕐 ${new Date(results.timestamp).toLocaleString()}`, ''];

  const add = (emoji, label, check) => {
    if (check.error) {
      lines.push(`${emoji} ${label}: ⚠️ Error — ${check.error}`);
    } else if (check.count === 0) {
      lines.push(`${emoji} ${label}: ✅ None`);
    } else {
      lines.push(`${emoji} ${label}: ⚠️ ${check.count} found`);
    }
  };

  add('👤', 'Stale Leads', checks.staleLeads);
  add('📋', 'Missed Follow-ups', checks.missedFollowups);
  add('🔴', 'Pipeline Bottlenecks', checks.pipelineBottlenecks);
  add('⏱️', 'Slow Responses', checks.slowResponses);

  const totalIssues = Object.values(checks).reduce((sum, c) => sum + (c.count || 0), 0);
  lines.push('');
  lines.push(totalIssues === 0 ? '✅ All clear — no issues detected.' : `⚠️ ${totalIssues} total issues need attention.`);

  return lines.join('\n');
}

/**
 * Parse MCP content response — handles both direct JSON and MCP text content format.
 */
function parseContent(result) {
  if (!result) return {};
  if (result.content?.[0]?.text) {
    try { return JSON.parse(result.content[0].text); } catch { return result; }
  }
  return result;
}

// ─── CLI Entry Point ────────────────────────────────────────
if (process.argv[1] && process.argv[1].includes('ghl_monitor')) {
  const dryRun = process.argv.includes('--dry-run');
  const alias = process.argv.find((a, i) => process.argv[i - 1] === '--location') || 'main';

  if (dryRun) {
    console.log('🔍 Dry run — would run all checks for location:', alias);
    console.log('Checks: stale_leads, missed_followups, pipeline_bottlenecks, slow_responses');
    console.log('Config path:', join(__dirname, 'config.json'));
    process.exit(0);
  }

  try {
    const config = loadConfig();
    const results = await runAllChecks(config, alias);
    console.log(results.summary);
    console.log('\n--- Raw Results ---');
    console.log(JSON.stringify(results.checks, null, 2));
  } catch (err) {
    console.error('Monitor error:', err.message);
    process.exit(1);
  }
}

export {
  checkStaleLeads,
  checkMissedFollowups,
  checkPipelineBottlenecks,
  checkSlowResponses,
  runAllChecks,
  formatSummary,
  loadConfig,
};
