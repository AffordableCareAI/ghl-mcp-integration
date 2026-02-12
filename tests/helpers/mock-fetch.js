/**
 * Fetch mock for testing MCP client without hitting real GHL API.
 * Provides canned responses for initialize, tools/list, and tools/call.
 */

const MOCK_SESSION_ID = 'mock-session-abc123';

const MOCK_TOOLS = [
  { name: 'contacts_get-contacts', description: 'Get contacts', inputSchema: { type: 'object', properties: {} } },
  { name: 'contacts_get-contact', description: 'Get contact by ID', inputSchema: { type: 'object', properties: { contactId: { type: 'string' } } } },
  { name: 'contacts_upsert-contact', description: 'Create or update contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'contacts_add-tags', description: 'Add tags to contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'contacts_remove-tags', description: 'Remove tags from contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'contacts_get-all-tasks', description: 'Get all tasks for contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'contacts_create-contact', description: 'Create contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'contacts_update-contact', description: 'Update contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'conversations_search-conversation', description: 'Search conversations', inputSchema: { type: 'object', properties: {} } },
  { name: 'conversations_get-messages', description: 'Get messages', inputSchema: { type: 'object', properties: {} } },
  { name: 'conversations_send-a-new-message', description: 'Send message', inputSchema: { type: 'object', properties: {} } },
  { name: 'opportunities_search-opportunity', description: 'Search opportunities', inputSchema: { type: 'object', properties: {} } },
  { name: 'opportunities_update-opportunity', description: 'Update opportunity', inputSchema: { type: 'object', properties: {} } },
  { name: 'opportunities_get-pipelines', description: 'Get pipelines', inputSchema: { type: 'object', properties: {} } },
  { name: 'opportunities_get-opportunity', description: 'Get opportunity', inputSchema: { type: 'object', properties: {} } },
  { name: 'locations_get-location', description: 'Get location', inputSchema: { type: 'object', properties: {} } },
  { name: 'locations_get-custom-fields', description: 'Get custom fields', inputSchema: { type: 'object', properties: {} } },
  { name: 'calendars_get-calendar-events', description: 'Get calendar events', inputSchema: { type: 'object', properties: {} } },
  { name: 'calendars_get-appointment-notes', description: 'Get appointment notes', inputSchema: { type: 'object', properties: {} } },
  { name: 'payments_list-transactions', description: 'List transactions', inputSchema: { type: 'object', properties: {} } },
  { name: 'payments_get-order-by-id', description: 'Get order by ID', inputSchema: { type: 'object', properties: {} } },
  { name: 'emails_fetch-template', description: 'Fetch email template', inputSchema: { type: 'object', properties: {} } },
  { name: 'emails_create-template', description: 'Create email template', inputSchema: { type: 'object', properties: {} } },
  { name: 'social-media-posting_create-post', description: 'Create social post', inputSchema: { type: 'object', properties: {} } },
  { name: 'social-media-posting_get-post', description: 'Get social post', inputSchema: { type: 'object', properties: {} } },
  { name: 'social-media-posting_get-posts', description: 'Get social posts', inputSchema: { type: 'object', properties: {} } },
  { name: 'social-media-posting_edit-post', description: 'Edit social post', inputSchema: { type: 'object', properties: {} } },
  { name: 'social-media-posting_get-account', description: 'Get social account', inputSchema: { type: 'object', properties: {} } },
  { name: 'social-media-posting_get-social-media-statistics', description: 'Get social stats', inputSchema: { type: 'object', properties: {} } },
  { name: 'blogs_get-blogs', description: 'Get blogs', inputSchema: { type: 'object', properties: {} } },
  { name: 'blogs_get-blog-post', description: 'Get blog post', inputSchema: { type: 'object', properties: {} } },
  { name: 'blogs_create-blog-post', description: 'Create blog post', inputSchema: { type: 'object', properties: {} } },
  { name: 'blogs_update-blog-post', description: 'Update blog post', inputSchema: { type: 'object', properties: {} } },
  { name: 'blogs_check-url-slug-exists', description: 'Check blog URL slug', inputSchema: { type: 'object', properties: {} } },
  { name: 'blogs_get-all-categories-by-location', description: 'Get blog categories', inputSchema: { type: 'object', properties: {} } },
  { name: 'blogs_get-all-blog-authors-by-location', description: 'Get blog authors', inputSchema: { type: 'object', properties: {} } },
];

const MOCK_CONTACTS = {
  contacts: [
    { id: 'c1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '+15551234567', tags: ['AI-Audit-Lead'], dateAdded: '2025-01-15T10:00:00Z', lastActivity: '2025-01-15T10:00:00Z' },
    { id: 'c2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', phone: '+15559876543', tags: ['High-Value-Lead'], dateAdded: '2025-01-16T14:00:00Z', lastActivity: new Date().toISOString() },
  ],
};

const MOCK_PIPELINES = {
  pipelines: [
    {
      id: 'pipe1',
      name: 'Strategic AI Audit Pipeline',
      stages: [
        { id: 'stage1', name: 'Audit Requested' },
        { id: 'stage2', name: 'Audit In Progress' },
        { id: 'stage3', name: 'Audit Completed' },
        { id: 'stage4', name: 'Proposal Sent' },
        { id: 'stage5', name: 'Contract Signed' },
      ],
    },
  ],
};

const MOCK_OPPORTUNITIES = {
  opportunities: [
    { id: 'opp1', name: 'John Doe - AI Audit', pipelineId: 'pipe1', pipelineStageId: 'stage2', monetaryValue: 2500, createdAt: '2025-01-10T00:00:00Z', updatedAt: '2025-01-10T00:00:00Z' },
    { id: 'opp2', name: 'Jane Smith - Implementation', pipelineId: 'pipe1', pipelineStageId: 'stage4', monetaryValue: 15000, createdAt: '2025-01-12T00:00:00Z', updatedAt: '2025-01-14T00:00:00Z' },
  ],
};

/**
 * Create a mock fetch function for testing.
 * @param {object} [overrides] - Override specific responses
 * @returns {{ fetch: Function, calls: Array }}
 */
function createMockFetch(overrides = {}) {
  const calls = [];

  async function mockFetch(url, options) {
    const body = JSON.parse(options.body || '{}');
    calls.push({ url, method: options.method, body, headers: options.headers });

    const method = body.method;
    let responseBody;

    if (method === 'initialize') {
      responseBody = {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'ghl-mcp-mock', version: '1.0.0' },
        },
      };
    } else if (method === 'notifications/initialized') {
      responseBody = { jsonrpc: '2.0' };
    } else if (method === 'tools/list') {
      responseBody = {
        jsonrpc: '2.0',
        id: body.id,
        result: { tools: overrides.tools || MOCK_TOOLS },
      };
    } else if (method === 'tools/call') {
      const toolName = body.params?.name;
      let content;

      if (overrides[toolName]) {
        content = overrides[toolName];
      } else if (toolName === 'contacts_get-contacts') {
        content = MOCK_CONTACTS;
      } else if (toolName === 'opportunities_get-pipelines') {
        content = MOCK_PIPELINES;
      } else if (toolName === 'opportunities_search-opportunity') {
        content = MOCK_OPPORTUNITIES;
      } else {
        content = { success: true };
      }

      responseBody = {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(content) }],
        },
      };
    } else {
      responseBody = { jsonrpc: '2.0', id: body.id, result: {} };
    }

    if (overrides.httpError) {
      return {
        ok: false,
        status: overrides.httpError,
        text: async () => 'Mock error',
        headers: new Map(),
      };
    }

    return {
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['mcp-session-id', MOCK_SESSION_ID],
      ]),
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    };
  }

  return { fetch: mockFetch, calls };
}

export { createMockFetch, MOCK_TOOLS, MOCK_CONTACTS, MOCK_PIPELINES, MOCK_OPPORTUNITIES, MOCK_SESSION_ID };
