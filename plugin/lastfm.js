// Last.fm API 客户端：签名、登录（桌面 Token 流程）、上报正在播放与 scrobble。

const API = 'https://ws.audioscrobbler.com/2.0/';

/// Last.fm 的签名：参数名按 ASCII 排序，拼成 name+value，末尾接 secret，取 md5。
/// format 和 callback 不参与签名。
export function signature(params, secret) {
  const keys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && k !== 'format' && k !== 'callback')
    .sort();
  let text = '';
  for (const k of keys) text += k + String(params[k]);
  return host.crypto.md5(text + secret);
}

/// 调用一个 API 方法。写操作一律 POST，参数放在表单里。
export async function call(method, params, { apiKey, secret, sk } = {}) {
  if (!apiKey || !secret) {
    const e = new Error('请先在插件设置里填写 Last.fm API Key 和 Shared Secret');
    e.code = 'setup';
    throw e;
  }
  const all = { ...params, method, api_key: apiKey };
  if (sk) all.sk = sk;
  all.api_sig = signature(all, secret);
  all.format = 'json';

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(all)) {
    if (v === undefined || v === null || v === '') continue;
    body.append(k, String(v));
  }

  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    const err = new Error(`连不上 Last.fm：${e && e.message ? e.message : e}`);
    err.code = 'network';
    throw err;
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Last.fm 返回了非 JSON 响应（HTTP ${res.status}）`);
  }
  if (data && data.error) {
    const err = new Error(data.message || `Last.fm 错误 ${data.error}`);
    err.code = Number(data.error);
    throw err;
  }
  return data;
}

export async function requestToken({ apiKey, secret }) {
  const data = await call('auth.getToken', {}, { apiKey, secret });
  if (!data || !data.token) throw new Error('Last.fm 没有返回授权 Token');
  return data.token;
}

export async function createSession({ apiKey, secret, token }) {
  const data = await call('auth.getSession', { token }, { apiKey, secret });
  const s = data && data.session;
  if (!s || !s.key) throw new Error('Last.fm 授权还没完成');
  return { key: s.key, name: s.name || '' };
}

export function updateNowPlaying(track, auth) {
  return call(
    'track.updateNowPlaying',
    {
      artist: track.artist,
      track: track.title,
      album: track.album,
      duration: Math.max(0, Math.round((track.duration || 0) / 1000)),
    },
    auth,
  );
}

/// 批量提交，Last.fm 一次最多 50 条；客户端这里最多传 50。
export function scrobbleBatch(entries, auth) {
  const params = {};
  entries.slice(0, 50).forEach((e, i) => {
    params[`artist[${i}]`] = e.artist;
    params[`track[${i}]`] = e.title;
    params[`timestamp[${i}]`] = String(e.timestamp);
    if (e.album) params[`album[${i}]`] = e.album;
    if (e.duration) params[`duration[${i}]`] = String(Math.round(e.duration / 1000));
    params[`chosenByUser[${i}]`] = '1';
  });
  return call('track.scrobble', params, auth);
}

export function userInfo(auth) {
  return call('user.getInfo', {}, auth);
}
