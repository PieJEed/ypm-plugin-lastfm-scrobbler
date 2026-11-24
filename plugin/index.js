import {
  createSession,
  requestToken,
  scrobbleBatch,
  updateNowPlaying,
} from './lastfm.js';
import { nowPlaying } from './mcp.js';
import { Tracker } from './tracker.js';

const POLL_MS = 4000;
const IDLE_RETRY_MS = 30000;
const QUEUE_KEY = 'pending';
const AUTH_KEY = 'auth';
const SESSION_KEY = 'session';
const STATS_KEY = 'stats';
const MAX_PENDING = 500;

const tracker = new Tracker({ mode: modeOf(host.setting('threshold')) });

let timer = null;
let busy = false;
let lastMcpLog = 0;
let lastFlushAt = 0;

function modeOf(value) {
  return value === '0.8' || value === '0.95' ? Number(value) : 'standard';
}

function settings() {
  return {
    apiKey: host.setting('apiKey').trim(),
    secret: host.setting('apiSecret').trim(),
    url: host.setting('mcpUrl').trim(),
    mcpToken: host.setting('mcpToken').trim(),
    threshold: host.setting('threshold'),
    muteNowPlaying: host.setting('muteNowPlaying') === 'true',
  };
}

function auth() {
  const a = host.storage.get(AUTH_KEY);
  return a && a.key ? a : null;
}

function pending() {
  const v = host.storage.get(QUEUE_KEY);
  return Array.isArray(v) ? v : [];
}

function savePending(list) {
  host.storage.set(QUEUE_KEY, list.slice(-MAX_PENDING));
}

function stats() {
  const v = host.storage.get(STATS_KEY);
  return v && typeof v === 'object' ? v : { scrobbled: 0, ignored: 0, errors: 0 };
}

function note(kind, message) {
  const s = stats();
  s[kind] = (s[kind] || 0) + 1;
  s.lastError = message || '';
  s.updatedAt = new Date().toISOString();
  host.storage.set(STATS_KEY, s);
  console.warn(`[lastfm] ${message}`);
}

function enqueue(entry, s) {
  const list = pending();
  const dup = list.some(
    (x) => x.artist === entry.artist && x.title === entry.title && x.timestamp === entry.timestamp,
  );
  if (dup) return;
  list.push({ ...entry, attempts: 0, queuedAt: Math.floor(s) });
  savePending(list);
}

/// 把队列里的记录尽量发出去。一次只发一批，避免触发 Last.fm 的频率限制。
async function flush(force = false) {
  const a = auth();
  if (!a) return;
  const list = pending();
  if (!list.length) return;
  if (!force && Date.now() - lastFlushAt < 60000) return;
  lastFlushAt = Date.now();

  const now = Math.floor(Date.now() / 1000);
  const alive = list.filter((e) => now - e.timestamp < 14 * 24 * 3600);
  if (alive.length !== list.length) savePending(alive);

  const batch = alive.slice(0, 50);
  if (!batch.length) return;
  try {
    const r = await scrobbleBatch(batch, { ...settings(), sk: a.key });
    const attr = r && r.scrobbles && r.scrobbles['@attr'];
    const accepted = attr ? Number(attr.accepted || 0) : batch.length;
    const ignored = attr ? Number(attr.ignored || 0) : 0;
    savePending(alive.slice(batch.length));
    const s = stats();
    s.scrobbled += accepted;
    s.ignored += ignored;
    s.updatedAt = new Date().toISOString();
    s.lastError = '';
    host.storage.set(STATS_KEY, s);
    console.log(`[lastfm] 已上报 ${accepted} 条${ignored ? `，忽略 ${ignored} 条` : ''}`);
  } catch (e) {
    if (e.code === 9) {
      host.storage.remove(AUTH_KEY);
      note('errors', 'Last.fm 登录已失效，请在插件设置里重新登录');
      return;
    }
    if (e.code === 26) {
      note('errors', 'Last.fm 已停用这个 API Key');
      return;
    }
    // 其余错误（网络、5xx、限流）留在队列，下次再试；多次失败的丢掉，免得永远卡住。
    const failed = new Set(batch.map((x) => `${x.artist}\u0000${x.title}\u0000${x.timestamp}`));
    const kept = [];
    for (const e2 of alive) {
      if (failed.has(`${e2.artist}\u0000${e2.title}\u0000${e2.timestamp}`)) {
        const attempts = (e2.attempts || 0) + 1;
        if (attempts < 5) kept.push({ ...e2, attempts });
        else note('errors', `放弃上报：${e2.artist} - ${e2.title}（${e && e.message ? e.message : e}）`);
      } else {
        kept.push(e2);
      }
    }
    savePending(kept);
    note('errors', `上报失败，稍后重试：${e && e.message ? e.message : e}`);
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const cfg = settings();
    const a = auth();
    if (!a || !cfg.apiKey || !cfg.secret) {
      tracker.reset();
      return;
    }
    tracker.mode = modeOf(cfg.threshold);

    let snap;
    try {
      snap = await nowPlaying({ url: cfg.url, token: cfg.mcpToken });
    } catch (e) {
      const now = Date.now();
      if (now - lastMcpLog > 5 * 60 * 1000) {
        lastMcpLog = now;
        console.warn(
          `[lastfm] 读不到 YesPlayMusic 的播放状态：${e && e.message ? e.message : e}。` +
            '请确认 设置 → MCP 里已启用本地服务，并在插件设置里填对地址。',
        );
      }
      return;
    }

    const wasFirst = !tracker.snapshot();
    const saved = host.storage.get(SESSION_KEY);
    if (wasFirst && saved && saved.key) tracker.restore(saved);

    const ev = tracker.observe(snap);
    const state = tracker.snapshot();
    if (state) host.storage.set(SESSION_KEY, state);
    else host.storage.remove(SESSION_KEY);

    const base = { ...cfg, sk: a.key };
    if (ev.nowPlaying && !cfg.muteNowPlaying) {
      try {
        await updateNowPlaying(ev.nowPlaying, base);
      } catch (e) {
        if (e.code === 9) {
          host.storage.remove(AUTH_KEY);
          note('errors', 'Last.fm 登录已失效，请在插件设置里重新登录');
        }
      }
    }
    if (ev.scrobble) {
      enqueue(ev.scrobble, Date.now() / 1000);
      await flush(true);
    }
    await flush();
  } finally {
    busy = false;
  }
}

function loop() {
  if (timer) return;
  const run = () => {
    tick()
      .catch((e) => console.error(`[lastfm] ${e && e.message ? e.message : e}`))
      .finally(() => {
        timer = setTimeout(run, auth() ? POLL_MS : IDLE_RETRY_MS);
      });
  };
  timer = setTimeout(run, 2000);
}

// 仅给本地测试用：停掉后台轮询。
export function stopLoop() {
  if (timer) clearTimeout(timer);
  timer = null;
}

// ───── 应用会调用的导出函数 ─────

export async function account() {
  loop();
  const a = auth();
  return a ? { id: a.name || 'lastfm', name: a.name || 'Last.fm' } : null;
}

export async function signIn() {
  const cfg = settings();
  if (!cfg.apiKey || !cfg.secret) {
    const e = new Error('请先在插件设置里填写 Last.fm API Key 和 Shared Secret');
    e.code = 'setup';
    throw e;
  }

  const token = await requestToken(cfg);
  const url = `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(cfg.apiKey)}&token=${encodeURIComponent(token)}`;
  host.openURL(url);
  host.signInPrompt({
    text: '已在浏览器打开 Last.fm 授权页，点「Allow access」后回到这里，会自动完成登录。',
  });

  const deadline = Date.now() + 9 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const session = await createSession({ ...cfg, token });
      host.storage.set(AUTH_KEY, { key: session.key, name: session.name, at: Date.now() });
      stopLoop();
      loop();
      return { id: session.name || 'lastfm', name: session.name || 'Last.fm' };
    } catch (e) {
      // 15 = 这个 token 还没被授权（用户还没点 Allow access），继续等；
      // 14 = token 不是我们申请的那个，重试也没用。
      if (e.code === 15) {
        continue;
      }
      if (e.code === 14) throw new Error('授权 Token 无效，请重新登录');
      throw e;
    }
  }
  throw new Error('等待授权超时，请重新登录');
}

export async function signOut() {
  host.storage.remove(AUTH_KEY);
  tracker.reset();
  host.storage.remove(SESSION_KEY);
}

// v3.0.0 目前没有任何地方调用 played，但文档里它是「上报听歌记录」的入口。
// 这里顺手实现：万一以后接上，立刻刷新一次状态。
export async function played() {
  await tick().catch(() => {});
}

// 应用加载插件时就会调用 account()；这里再兜底启动一次。
loop();
