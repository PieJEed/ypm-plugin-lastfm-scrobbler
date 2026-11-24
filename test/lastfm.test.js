import test from 'node:test';
import assert from 'node:assert/strict';

import { installHost } from '../test-support/harness.mjs';

installHost();
const { signature } = await import('../plugin/lastfm.js');

test('签名与 Last.fm 文档示例一致', () => {
  // 文档里 secret = ilovecher 的例子
  const params = {
    api_key: 'xxxxxxxxxx',
    method: 'auth.getSession',
    token: 'yyyyyy',
  };
  const got = signature(params, 'ilovecher');
  assert.equal(got, 'b87d61da3cda91a8b6746c4aef55d6f8');
});

test('流媒体数组参数按 ASCII 排序（artist[10] 在 artist[2] 前）', () => {
  const params = {
    'artist[2]': 'C',
    'artist[10]': 'K',
    'artist[0]': 'A',
    method: 'track.scrobble',
    api_key: 'k',
  };
  const sorted = Object.keys(params).sort();
  assert.deepEqual(sorted, ['api_key', 'artist[0]', 'artist[10]', 'artist[2]', 'method']);
  assert.equal(signature(params, 's'), host.crypto.md5(sorted.map((k) => k + params[k]).join('') + 's'));
});

test('签名不包含 format 和 callback', () => {
  const a = signature({ api_key: 'k', method: 'm', callback: 'x' }, 's');
  const b = signature({ api_key: 'k', method: 'm' }, 's');
  assert.equal(a, b);
  const c = signature({ api_key: 'k', method: 'm', format: 'json' }, 's');
  assert.equal(c, b);
});
