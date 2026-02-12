/**
 * Fetch mock for testing MCP client without hitting real GHL API.
 * Provides canned responses for initialize, tools/list, and tools/call.
 */

const MOCK_SESSION_ID = 'mock-session-abc123';

const MOCK_TOOLS = [
  { name: 'get-contacts', description: 'Get contacts', inputSchema: { type: 'object', properties: {} } },
  { name: 'get-contact', description: 'Get contact by ID', inputSchema: { type: 'object', properties: { contactId: { type: 'string' } } } },
  { name: 'upsert-contact', description: 'Create or update contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'add-tags', description: 'Add tags to contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'remove-tags', description: 'Remove tags from contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'get-all-tasks', description: 'Get all tasks for contact', inputSchema: { type: 'object', properties: {} } },
  { name: 'search-conversation', description: 'Search conversations', inputSchema: { type: 'object', properties: {} } },
  { name: 'get-messages', description: 'Get messages', inputSchema: { type: 'object', properties: {} } },
  { name: 'send-a-new-message', description: 'Send message', inputSchema: { type: 'object', properties: {} } },
  { name: 'search-opportunity', description: 'Search opportunities', inputSchema: { type: 'object', properties: {} } },
  { name: 'update-opportunity', description: 'Update opportunity', inputSchema: { type: 'object', properties: {} } },
  { name: 'get-pipelines', description: 'Get pipelines', inputSchema: { type: 'object', properties: {} } },
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
      } else if (toolName === 'get-contacts') {
        content = MOCK_CONTACTS;
      } else if (toolName === 'get-pipelines') {
        content = MOCK_PIPELINES;
      } else if (toolName === 'search-opportunity') {
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
