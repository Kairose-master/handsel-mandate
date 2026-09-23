// Minimal MCP-over-HTTP client for a Chrome extension background script (no SDK).
// Talks JSON-RPC to the local 402-LAB server started with `node mcp/server.js --http`.
export function createMcpClient({ url = 'http://127.0.0.1:4402/mcp', token }) {
  let id = 0;
  async function rpc(method, params) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
    const type = res.headers.get('content-type') ?? '';
    const raw = await res.text();
    const message = type.includes('text/event-stream') ? raw.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5))).find(m => m.id === id) : JSON.parse(raw);
    if (message?.error) throw new Error(message.error.message);
    return message?.result;
  }
  return {
    async init() { const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'browser-extension', version: '0.1.0' } }); await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }); return r; },
    tools: () => rpc('tools/list', {}),
    call: async (name, args = {}) => { const r = await rpc('tools/call', { name, arguments: args }); const t = r.content?.find(c => c.type === 'text')?.text ?? ''; if (r.isError) throw new Error(t); try { return JSON.parse(t); } catch { return t; } },
  };
}
