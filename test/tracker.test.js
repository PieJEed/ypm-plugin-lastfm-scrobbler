import test from 'node:test';
import assert from 'node:assert/strict';

import { Tracker } from '../plugin/tracker.js';

const track = (over = {}) => ({
  id: 'song-1',
  source: 'qqmusic',
  title: '测试歌曲',
  artist: '测试歌手',
  album: '测试专辑',
  duration: 180,
  ...over,
});

const snap = (position, playing = true, over = {}) => ({
  playing,
  position,
  duration: 180,
  track: track(over),
});

test('满一半才开始 scrobble，且时间戳是开播时间', () => {
  const tr = new Tracker();
  const t0 = 1_700_000_000_000;
  assert.deepEqual(tr.observe(snap(0), t0).scrobble, undefined);

  let ev;
  for (let i = 1; i <= 22; i++) {
    ev = tr.observe(snap(i * 4), t0 + i * 4000);
    assert.equal(ev.scrobble, undefined, `第 ${i * 4} 秒还不该上报`);
  }
  ev = tr.observe(snap(92), t0 + 92_000);
  assert.ok(ev.scrobble, '听满 90 秒后应当 scrobble');
  assert.equal(ev.scrobble.title, '测试歌曲');
  assert.equal(ev.scrobble.artist, '测试歌手');
  assert.equal(ev.scrobble.timestamp, Math.floor(t0 / 1000));
});

test('同一首歌只 scrobble 一次', () => {
  const tr = new Tracker();
  const t0 = 1_700_000_000_000;
  let count = 0;
  for (let i = 0; i <= 45; i++) {
    const ev = tr.observe(snap(i * 4), t0 + i * 4000);
    if (ev.scrobble) count++;
  }
  assert.equal(count, 1);
});

test('短于 30 秒的曲子不 scrobble', () => {
  const tr = new Tracker();
  const t0 = 1_700_000_000_000;
  let count = 0;
  for (let i = 0; i <= 20; i++) {
    const ev = tr.observe(snap(i * 1, true, { duration: 20 }), t0 + i * 1000);
    if (ev.scrobble) count++;
  }
  assert.equal(count, 0);
});

test('暂停期间不计时长', () => {
  const tr = new Tracker();
  const t0 = 1_700_000_000_000;
  tr.observe(snap(0), t0);
  tr.observe(snap(4), t0 + 4000);
  tr.observe(snap(8), t0 + 8000);
  // 暂停 10 分钟后恢复到同一进度
  let ev = tr.observe(snap(12, false), t0 + 604000);
  assert.equal(ev.scrobble, undefined);
  ev = tr.observe(snap(12), t0 + 608000);
  assert.equal(ev.scrobble, undefined);
  assert.equal(tr.snapshot().listened, 8000, '只累计真正在播的 8 秒');
});

test('单曲循环（进度回到开头）会算新的一次播放', () => {
  const tr = new Tracker();
  const t0 = 1_700_000_000_000;
  let scrobbles = 0;
  let i = 0;
  // 第一遍 0→180 秒
  for (; i <= 45; i++) {
    if (tr.observe(snap((i * 4) % 180), t0 + i * 4000).scrobble) scrobbles++;
  }
  // 第二遍重新从 0 开始
  for (let j = 0; j <= 45; j++, i++) {
    if (tr.observe(snap((j * 4) % 180), t0 + i * 4000).scrobble) scrobbles++;
  }
  assert.equal(scrobbles, 2);
});

test('切歌时重置，新的歌重新计时', () => {
  const tr = new Tracker();
  const t0 = 1_700_000_000_000;
  tr.observe(snap(0), t0);
  tr.observe(snap(20), t0 + 20000);
  const ev = tr.observe(snap(0, true, { id: 'song-2', title: '第二首' }), t0 + 24000);
  assert.equal(ev.scrobble, undefined);
  assert.equal(tr.snapshot().title, '第二首');
  assert.equal(tr.snapshot().listened, 0);
});

test('恢复保存的状态后不会重复上报', () => {
  const tr = new Tracker();
  const t0 = 1_700_000_000_000;
  tr.restore({
    key: 'qqmusic:song-1',
    title: '测试歌曲',
    artist: '测试歌手',
    album: '测试专辑',
    duration: 180000,
    source: 'qqmusic',
    id: 'song-1',
    startedAt: Math.floor(t0 / 1000) - 100,
    listened: 120000,
    lastPos: 120000,
    lastAt: t0,
    wasPlaying: true,
    nowPlayingAt: t0,
    scrobbled: true,
  });
  const ev = tr.observe(snap(124), t0 + 4000);
  assert.equal(ev.scrobble, undefined);
});

test('中途往回拖不当作新的一遍，也不会重复上报', () => {
  const tr = new Tracker();
  const t0 = 1_700_000_000_000;
  let scrobbles = 0;
  for (let i = 0; i <= 45; i++) {
    if (tr.observe(snap(i * 4), t0 + i * 4000).scrobble) scrobbles++;
  }
  // 从 180 秒拖回 100 秒继续听
  for (let i = 25; i <= 45; i++) {
    if (tr.observe(snap(i * 4), t0 + (i + 45) * 4000).scrobble) scrobbles++;
  }
  assert.equal(scrobbles, 1);
});

test('应用挂起后不会把整段时间补记成收听时长', () => {
  const tr = new Tracker();
  const t0 = 1_700_000_000_000;
  tr.observe(snap(0), t0);
  const ev = tr.observe(snap(4), t0 + 30 * 60 * 1000);
  assert.equal(ev.scrobble, undefined);
  assert.equal(tr.snapshot().listened, 15000);
});
