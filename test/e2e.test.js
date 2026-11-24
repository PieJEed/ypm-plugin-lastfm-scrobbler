import test from 'node:test';
import assert from 'node:assert/strict';

import { installHost, jsonResponse } from '../test-support/harness.mjs';

test('从 MCP 快照到 Last.fm scrobble 的完整链路', async () => {
  const { kv } = installHost({
    settings: {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      mcpUrl: 'http://127.0.0.1:18888',
    },
    storage: { auth: { key: 'test-session', name: 'tester' } },
  });

  let clock = 1_700_000_000_000;
  const realNow = Date.now;
  Date.now = () => clock;

  let position = 0;
  const scrobbles = [];
  const nowPlayingCalls = [];
  let sessionId = '';

  const snapshot = () => ({
    playing: true,
    position,
    duration: 262,
    track: {
      title: '心安之地',
      artist: '许嵩',
      album: '安泊猜想',
      duration: 262,
      source: 'qqmusic',
      id: '000h1psW2HN90S',
    },
  });

  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1:18888')) {
      const msg = JSON.parse(init.body);
      if (msg.method === 'initialize') {
        sessionId = 'sess-1';
        return jsonResponse(
          { jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: {} } },
          { 'mcp-session-id': sessionId },
        );
      }
      if (!msg.id) return new Response('', { status: 202 });
      assert.equal(msg.params.name, 'get_now_playing');
      return jsonResponse({
        jsonrpc: '2.0',
        id: msg.id,
        result: { content: [{ type: 'text', text: JSON.stringify(snapshot()) }] },
      });
    }
    if (String(url).startsWith('https://ws.audioscrobbler.com')) {
      const body = Object.fromEntries(new URLSearchParams(init.body));
      if (body.method === 'track.updateNowPlaying') nowPlayingCalls.push(body);
      if (body.method === 'track.scrobble') scrobbles.push(body);
      return jsonResponse({
        scrobbles: { scrobble: {}, '@attr': { accepted: '1', ignored: '0' } },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const plugin = await import('../plugin/index.js');
  assert.deepEqual(await plugin.account(), { id: 'tester', name: 'tester' });

  for (let i = 0; i <= 40; i++) {
    position = i * 4;
    await plugin.played();
    clock += 4000;
  }

  assert.equal(nowPlayingCalls.length, 1, '只在开始播放时上报一次「正在播放」');
  assert.equal(nowPlayingCalls[0].artist, '许嵩');
  assert.equal(nowPlayingCalls[0].track, '心安之地');
  assert.ok(nowPlayingCalls[0].api_sig, '请求带签名');

  assert.equal(scrobbles.length, 1, '听满一半后上报一次');
  const s = scrobbles[0];
  assert.equal(s['artist[0]'], '许嵩');
  assert.equal(s['track[0]'], '心安之地');
  assert.equal(s['album[0]'], '安泊猜想');
  assert.equal(s['duration[0]'], '262');
  assert.equal(s['timestamp[0]'], String(Math.floor(1_700_000_000_000 / 1000)));
  assert.equal(s.sk, 'test-session');
  assert.equal(kv.get('pending').length, 0, '成功后从队列移除');
  assert.equal(kv.get('stats').scrobbled, 1);

  plugin.stopLoop();
  Date.now = realNow;
});

test('网络失败时把 scrobble 留在队列里', async () => {
  const { kv } = installHost({
    settings: { apiKey: 'k', apiSecret: 's', mcpUrl: 'http://127.0.0.1:18888' },
    storage: { auth: { key: 'sk', name: 'tester' } },
  });

  let clock = 1_700_000_000_000;
  const realNow = Date.now;
  Date.now = () => clock;

  let position = 0;
  let failLastfm = true;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1:18888')) {
      const msg = JSON.parse(init.body);
      if (msg.method === 'initialize') {
        return jsonResponse({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }, { 'mcp-session-id': 's2' });
      }
      if (!msg.id) return new Response('', { status: 202 });
      return jsonResponse({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ playing: true, position, duration: 200, track: { title: 'A', artist: 'B', duration: 200, id: 'x', source: 's' } }),
            },
          ],
        },
      });
    }
    failLastfm = false;
    throw new TypeError('network down');
  };

  const plugin = await import('../plugin/index.js');
  for (let i = 0; i <= 30; i++) {
    position = i * 4;
    await plugin.played();
    clock += 4000;
  }
  const queued = kv.get('pending');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].title, 'A');
  assert.equal(failLastfm, false);
  assert.ok(kv.get('stats').errors >= 1);

  plugin.stopLoop();
  Date.now = realNow;
});
