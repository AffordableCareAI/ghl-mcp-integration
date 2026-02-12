/**
 * GHL MCP Action Functions
 * High-level operations for contact management, pipeline moves, and messaging.
 */

import { createMcpClient } from '../shared/ghl-mcp-client.js';
import { createRateLimiter, withRetry, log, resolveEnvValue } from '../shared/ghl-utils.js';

/**
 * Create an action client for a location config.
 * @param {object} locationConfig - Location config from config.json
 * @returns {object} Action functions bound to this location
 */
function createActions(locationConfig) {
  const token = resolveEnvValue(locationConfig.token);
  const locationId = resolveEnvValue(locationConfig.locationId);
  const client = createMcpClient({ token, locationId });
  const limiter = createRateLimiter();

  async function call(toolName, args = {}) {
    await limiter.acquire();
    return withRetry(() => client.callTool(toolName, args));
  }

  async function ensureInitialized() {
    if (!client.initialized) {
      await client.initialize();
      log('info', 'MCP client initialized', { location: locationConfig.alias });
    }
  }

  // ─── Contact Operations ───────────────────────────────────

  async function searchContacts(query, options = {}) {
    await ensureInitialized();
    const args = { query, ...options };
    if (options.limit) args.limit = options.limit;
    log('info', 'Searching contacts', { query });
    return call('get-contacts', args);
  }

  async function getContactDetails(contactId) {
    await ensureInitialized();
    log('info', 'Getting contact details', { contactId });
    return call('get-contact', { contactId });
  }

  async function upsertContact(contactData) {
    await ensureInitialized();
    log('info', 'Upserting contact', { email: contactData.email, phone: contactData.phone });
    return call('upsert-contact', contactData);
  }

  async function tagContacts(contactIds, tags) {
    await ensureInitialized();
    const ids = Array.isArray(contactIds) ? contactIds : [contactIds];
    const tagList = Array.isArray(tags) ? tags : [tags];
    log('info', 'Adding tags', { count: ids.length, tags: tagList });

    const results = [];
    for (const contactId of ids) {
      const result = await call('add-tags', { contactId, tags: tagList });
      results.push({ contactId, result });
    }
    return results;
  }

  async function removeContactTags(contactIds, tags) {
    await ensureInitialized();
    const ids = Array.isArray(contactIds) ? contactIds : [contactIds];
    const tagList = Array.isArray(tags) ? tags : [tags];
    log('info', 'Removing tags', { count: ids.length, tags: tagList });

    const results = [];
    for (const contactId of ids) {
      const result = await call('remove-tags', { contactId, tags: tagList });
      results.push({ contactId, result });
    }
    return results;
  }

  async function getContactTasks(contactId) {
    await ensureInitialized();
    return call('get-all-tasks', { contactId });
  }

  // ─── Conversation Operations ──────────────────────────────

  async function getConversationHistory(contactId, options = {}) {
    await ensureInitialized();
    log('info', 'Getting conversation history', { contactId });
    const convResult = await call('search-conversation', { contactId });
    const conversations = convResult?.content?.[0]?.text
      ? JSON.parse(convResult.content[0].text)
      : convResult;

    if (conversations?.conversations?.length > 0) {
      const conversationId = conversations.conversations[0].id;
      return call('get-messages', { conversationId, ...options });
    }
    return { messages: [] };
  }

  async function sendMessage(contactId, { type = 'SMS', message }) {
    await ensureInitialized();
    log('info', 'Sending message', { contactId, type });
    return call('send-a-new-message', {
      contactId,
      type,
      message,
    });
  }

  // ─── Pipeline & Opportunity Operations ────────────────────

  async function getPipelines() {
    await ensureInitialized();
    return call('get-pipelines', {});
  }

  async function searchOpportunities(options = {}) {
    await ensureInitialized();
    log('info', 'Searching opportunities', options);
    return call('search-opportunity', options);
  }

  async function moveOpportunity(opportunityId, stageId, options = {}) {
    await ensureInitialized();
    log('info', 'Moving opportunity', { opportunityId, stageId });
    return call('update-opportunity', {
      id: opportunityId,
      stageId,
      ...options,
    });
  }

  async function getPipelineOverview(pipelineId) {
    await ensureInitialized();
    const pipelines = await getPipelines();
    const pipelinesData = pipelines?.content?.[0]?.text
      ? JSON.parse(pipelines.content[0].text)
      : pipelines;

    const pipeline = pipelinesData?.pipelines?.find(p => p.id === pipelineId) || pipelinesData?.pipelines?.[0];
    if (!pipeline) return { error: 'No pipeline found' };

    const opps = await searchOpportunities({ pipelineId: pipeline.id });
    const oppsData = opps?.content?.[0]?.text
      ? JSON.parse(opps.content[0].text)
      : opps;

    const stages = {};
    for (const stage of (pipeline.stages || [])) {
      const stageOpps = (oppsData?.opportunities || []).filter(o => o.pipelineStageId === stage.id);
      stages[stage.name] = {
        id: stage.id,
        count: stageOpps.length,
        value: stageOpps.reduce((sum, o) => sum + (o.monetaryValue || 0), 0),
      };
    }

    return {
      pipeline: pipeline.name,
      pipelineId: pipeline.id,
      totalOpportunities: oppsData?.opportunities?.length || 0,
      stages,
    };
  }

  // ─── Lifecycle ────────────────────────────────────────────

  async function close() {
    await client.close();
  }

  return {
    searchContacts,
    getContactDetails,
    upsertContact,
    tagContacts,
    removeContactTags,
    getContactTasks,
    getConversationHistory,
    sendMessage,
    getPipelines,
    searchOpportunities,
    moveOpportunity,
    getPipelineOverview,
    close,
    get rateLimiterStats() { return limiter.stats(); },
  };
}

export { createActions };
