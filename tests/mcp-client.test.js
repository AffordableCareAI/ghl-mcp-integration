/**
 * Tests for shared/ghl-mcp-client.js
 * Uses node:test + mock fetch (zero test dependencies).
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createMockFetch, MOCK_TOOLS, MOCK_SESSION_ID } from './helpers/mock-fetch.js';

// We need to mock global fetch before importing the client
let createMcpClient, parseSSEResponse;

describe('ghl-mcp-client', () => {
  let mockFetchHelper;

  before(async () => {
    mockFetchHelper = createMockFetch();
    // Replace global fetch
    globalThis._originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchHelper.fetch;

    // Now import the module (it will use our mocked fetch)
    const mod = await import('../shared/ghl-mcp-client.js');
    createMcpClient = mod.createMcpClient;
    parseSSEResponse = mod.parseSSEResponse;
  });

  after(() => {
    globalThis.fetch = globalThis._originalFetch;
  });

  describe('createMcpClient', () => {
    it('should throw if token is missing', () => {
      assert.throws(() => createMcpClient({ locationId: 'loc1' }), /token is required/);
    });

    it('should throw if locationId is missing', () => {
      assert.throws(() => createMcpClient({ token: 'tok1' }), /locationId is required/);
    });

    it('should create a client with required config', () => {
      const client = createMcpClient({ token: 'tok1', locationId: 'loc1' });
      assert.equal(client.initialized, false);
      assert.equal(client.sessionId, null);
    });
  });

  describe('initialize', () => {
    it('should initialize and set session ID', async () => {
      // Fresh mock for this test
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const client = createMcpClient({ token: 'test-token', locationId: 'test-loc' });
      const result = await client.initialize();

      assert.ok(result.capabilities);
      assert.ok(result.serverInfo);
      assert.equal(result.serverInfo.name, 'ghl-mcp-mock');
      assert.equal(client.initialized, true);
      assert.equal(client.sessionId, MOCK_SESSION_ID);

      // Should have sent initialize + notifications/initialized
      assert.ok(m.calls.length >= 1);
      assert.equal(m.calls[0].body.method, 'initialize');
    });
  });

  describe('listTools', () => {
    it('should return tools list', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const client = createMcpClient({ token: 'test-token', locationId: 'test-loc' });
      const result = await client.listTools();

      assert.ok(result.tools);
      assert.equal(result.tools.length, MOCK_TOOLS.length);
      assert.equal(result.tools[0].name, 'contacts_get-contacts');
    });

    it('should auto-initialize if not initialized', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const client = createMcpClient({ token: 'test-token', locationId: 'test-loc' });
      assert.equal(client.initialized, false);

      await client.listTools();
      assert.equal(client.initialized, true);
    });
  });

  describe('callTool', () => {
    it('should call a tool and return result', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const client = createMcpClient({ token: 'test-token', locationId: 'test-loc' });
      const result = await client.callTool('contacts_get-contacts', {});

      assert.ok(result.content);
      assert.equal(result.content[0].type, 'text');

      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.contacts);
      assert.equal(parsed.contacts.length, 2);
    });

    it('should include authorization and locationId headers', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const client = createMcpClient({ token: 'my-token', locationId: 'my-loc' });
      await client.callTool('contacts_get-contacts', {});

      // Find the tools/call request (skip initialize + notification)
      const toolCall = m.calls.find(c => c.body.method === 'tools/call');
      assert.ok(toolCall);
      assert.equal(toolCall.headers.Authorization, 'Bearer my-token');
      assert.equal(toolCall.headers.locationId, 'my-loc');
    });
  });

  describe('close', () => {
    it('should reset client state', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const client = createMcpClient({ token: 'test-token', locationId: 'test-loc' });
      await client.initialize();
      assert.equal(client.initialized, true);

      await client.close();
      assert.equal(client.initialized, false);
      assert.equal(client.sessionId, null);
    });
  });

  describe('error handling', () => {
    it('should throw on HTTP error', async () => {
      const m = createMockFetch({ httpError: 401 });
      globalThis.fetch = m.fetch;

      const client = createMcpClient({ token: 'bad-token', locationId: 'test-loc' });
      await assert.rejects(client.initialize(), /MCP HTTP 401/);
    });
  });
});

describe('parseSSEResponse', () => {
  it('should parse SSE stream with data events', async () => {
    const data = 'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(data));
        controller.close();
      },
    });

    const messages = await parseSSEResponse(stream);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, 1);
  });

  it('should handle multiple SSE events', async () => {
    const data = 'data: {"jsonrpc":"2.0","method":"notification"}\n\ndata: {"jsonrpc":"2.0","id":2,"result":{}}\n\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(data));
        controller.close();
      },
    });

    const messages = await parseSSEResponse(stream);
    assert.equal(messages.length, 2);
  });
});
