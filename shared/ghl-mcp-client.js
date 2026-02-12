/**
 * GHL MCP HTTP Streamable Client
 * Zero-dependency MCP client using native fetch() for GoHighLevel's MCP endpoint.
 * Implements JSON-RPC 2.0 over HTTP Streamable Transport (MCP 2025-06-18).
 */

const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_TIMEOUT_MS = 30_000;
const GHL_MCP_ENDPOINT = 'https://services.leadconnectorhq.com/mcp/';

let _requestId = 0;
function nextId() { return ++_requestId; }

/**
 * Parse an SSE (text/event-stream) response body into JSON-RPC messages.
 * @param {ReadableStream} body
 * @returns {Promise<object[]>}
 */
async function parseSSEResponse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const messages = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentData = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        currentData += line.slice(6);
      } else if (line === '' && currentData) {
        try {
          messages.push(JSON.parse(currentData));
        } catch { /* skip malformed */ }
        currentData = '';
      }
    }
  }

  // Flush remaining
  if (buffer.startsWith('data: ')) {
    try {
      messages.push(JSON.parse(buffer.slice(6)));
    } catch { /* skip */ }
  }

  return messages;
}

/**
 * Send a JSON-RPC request to the MCP endpoint.
 * @param {string} url - MCP endpoint URL
 * @param {object} headers - Authorization headers
 * @param {object} request - JSON-RPC request body
 * @param {string|null} sessionId - Mcp-Session-Id from prior initialize
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<{result: object, sessionId: string|null}>}
 */
async function sendJsonRpc(url, headers, request, sessionId = null, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const reqHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    ...headers,
  };
  if (sessionId) {
    reqHeaders['Mcp-Session-Id'] = sessionId;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`MCP HTTP ${response.status}: ${text}`);
    }

    const newSessionId = response.headers.get('mcp-session-id') || sessionId;
    const contentType = response.headers.get('content-type') || '';

    let result;
    if (contentType.includes('text/event-stream')) {
      const messages = await parseSSEResponse(response.body);
      // Return the last JSON-RPC response (notifications may precede it)
      result = messages.filter(m => m.id === request.id).pop() || messages.pop() || {};
    } else {
      result = await response.json();
    }

    return { result, sessionId: newSessionId };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create an MCP client for a GHL location.
 * @param {object} config
 * @param {string} config.token - GHL Private Integration Token (PIT)
 * @param {string} config.locationId - GHL Location ID
 * @param {string} [config.url] - MCP endpoint URL (defaults to GHL)
 * @param {number} [config.timeoutMs] - Request timeout in ms
 * @returns {object} Client with initialize, listTools, callTool, close methods
 */
function createMcpClient(config) {
  const {
    token,
    locationId,
    url = GHL_MCP_ENDPOINT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = config;

  if (!token) throw new Error('GHL token is required');
  if (!locationId) throw new Error('GHL locationId is required');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'locationId': locationId,
  };

  let sessionId = null;
  let initialized = false;
  let serverCapabilities = null;
  let serverInfo = null;

  async function initialize() {
    const request = {
      jsonrpc: '2.0',
      id: nextId(),
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'ghl-mcp-client',
          version: '1.0.0',
        },
      },
    };

    const resp = await sendJsonRpc(url, headers, request, null, timeoutMs);
    sessionId = resp.sessionId;

    if (resp.result.error) {
      throw new Error(`MCP initialize error: ${JSON.stringify(resp.result.error)}`);
    }

    serverCapabilities = resp.result.result?.capabilities || {};
    serverInfo = resp.result.result?.serverInfo || {};
    initialized = true;

    // Send initialized notification
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    };
    await sendJsonRpc(url, headers, notification, sessionId, timeoutMs).catch(() => {});

    return { capabilities: serverCapabilities, serverInfo };
  }

  async function listTools(cursor = undefined) {
    if (!initialized) await initialize();

    const request = {
      jsonrpc: '2.0',
      id: nextId(),
      method: 'tools/list',
      params: cursor ? { cursor } : {},
    };

    const resp = await sendJsonRpc(url, headers, request, sessionId, timeoutMs);
    sessionId = resp.sessionId || sessionId;

    if (resp.result.error) {
      throw new Error(`MCP tools/list error: ${JSON.stringify(resp.result.error)}`);
    }

    return resp.result.result || { tools: [] };
  }

  async function callTool(name, args = {}) {
    if (!initialized) await initialize();

    const request = {
      jsonrpc: '2.0',
      id: nextId(),
      method: 'tools/call',
      params: { name, arguments: args },
    };

    const resp = await sendJsonRpc(url, headers, request, sessionId, timeoutMs);
    sessionId = resp.sessionId || sessionId;

    if (resp.result.error) {
      throw new Error(`MCP tools/call error (${name}): ${JSON.stringify(resp.result.error)}`);
    }

    return resp.result.result || {};
  }

  async function close() {
    sessionId = null;
    initialized = false;
    serverCapabilities = null;
    serverInfo = null;
  }

  return {
    initialize,
    listTools,
    callTool,
    close,
    get sessionId() { return sessionId; },
    get initialized() { return initialized; },
    get serverCapabilities() { return serverCapabilities; },
    get serverInfo() { return serverInfo; },
  };
}

export {
  createMcpClient,
  sendJsonRpc,
  parseSSEResponse,
  GHL_MCP_ENDPOINT,
  MCP_PROTOCOL_VERSION,
};
