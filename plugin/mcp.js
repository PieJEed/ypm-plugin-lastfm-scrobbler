// 读 YesPlayMusic 自带的本地 MCP 服务：get_now_playing 给出当前曲目、进度和播放状态。
// 只用到 Streamable HTTP 的 POST，不需要 SSE 通道。

let sessionId = '';
let sessionUrl = '';
let nextId = 0;

export function endpoint(raw) {
  let url = String(raw || '').trim() || 'http://127.0.0.1:18888';
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  url = url.replace(/\/+$/, '');
  if (!/\/mcp$/i.test(url)) url += '/mcp';
  return url;
}

async function post(url, payload, token) {
  const headers = { 'content-type': 'application/json' };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  if (!res.ok) {
    const e = new Error(`YesPlayMusic MCP 返回 HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function initialize(url, token) {
  const reply = await post(
    url,
    {
      jsonrpc: '2.0',
      id: ++nextId,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'yesplaymusic-lastfm', version: '1.0.0' },
      },
    },
    token,
  );
  if (!reply || !reply.result) throw new Error('YesPlayMusic MCP 初始化失败');
  await post(
    url,
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    token,
  );
}

async function callTool(name, url, token) {
  const payload = {
    jsonrpc: '2.0',
    id: ++nextId,
    method: 'tools/call',
    params: { name, arguments: {} },
  };
  let reply;
  try {
    if (!sessionId || sessionUrl !== url) {
      sessionId = '';
      await initialize(url, token);
      sessionUrl = url;
    }
    reply = await post(url, payload, token);
    if (reply && reply.error && /session/i.test(reply.error.message || '')) {
      sessionId = '';
      await initialize(url, token);
      reply = await post(url, payload, token);
    }
  } catch (e) {
    if (e.status === 404) {
      sessionId = '';
      await initialize(url, token);
      reply = await post(url, payload, token);
    } else {
      throw e;
    }
  }
  if (!reply) throw new Error('YesPlayMusic MCP 没有返回内容');
  if (reply.error) throw new Error(reply.error.message || 'YesPlayMusic MCP 调用失败');

  const content = reply.result && reply.result.content;
  const text = Array.isArray(content) && content[0] && content[0].text;
  if (reply.result && reply.result.isError) {
    throw new Error(text || 'YesPlayMusic MCP 调用失败');
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('YesPlayMusic MCP 返回了无法解析的内容');
  }
}

/// 返回 { playing, position, duration, track: { id, source, title, artist, album, duration } }
export function nowPlaying({ url, token }) {
  return callTool('get_now_playing', endpoint(url), token);
}
