import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { installHost } from '../test-support/harness.mjs';

installHost();
const { nowPlaying, endpoint } = await import('../plugin/mcp.js');

test('endpoint 自动补 http:// 和 /mcp', () => {
  assert.equal(endpoint(''), 'http://127.0.0.1:18888/mcp');
  assert.equal(endpoint('127.0.0.1:18888'), 'http://127.0.0.1:18888/mcp');
  assert.equal(endpoint('http://127.0.0.1:18888/'), 'http://127.0.0.1:18888/mcp');
  assert.equal(endpoint('http://127.0.0.1:18888/mcp'), 'http://127.0.0.1:18888/mcp');
});

test('按 MCP 协议初始化并解析 get_now_playing', async () => {
  const calls = [];
  const payload = {
    playing: true,
    position: 12.5,
    duration: 262,
    track: { title: '心安之地', artist: '许嵩', album: '安泊猜想', duration: 262, source: 'qqmusic', id: 'abc' },
  };

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body);
      calls.push({ msg, session: req.headers['mcp-session-id'] || '' });
      if (msg.method === 'initialize') {
        res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'yesplaymusic', version: '3.0.0' } } }));
      } else if (!msg.id) {
        res.writeHead(202);
        res.end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } }));
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const got = await nowPlaying({ url: `http://127.0.0.1:${port}` });
  server.close();

  assert.equal(got.track.title, '心安之地');
  assert.equal(got.position, 12.5);
  assert.deepEqual(calls.map((x) => x.msg.method), ['initialize', 'notifications/initialized', 'tools/call']);
  assert.equal(calls[2].msg.params.name, 'get_now_playing');
  assert.equal(calls[2].session, 'sess-1');
});

test('MCP 不可用时抛出可读错误', async () => {
  await assert.rejects(() => nowPlaying({ url: 'http://127.0.0.1:1' }));
});
