import { createHash } from 'node:crypto';

/// 模拟 QuickJS 宿主：storage / setting / crypto / openURL。
export function installHost({ settings = {}, storage = {} } = {}) {
  const kv = new Map(Object.entries(storage));
  const cfg = new Map(Object.entries(settings));
  const opened = [];
  const prompts = [];

  globalThis.host = {
    platform: 'windows',
    arch: 'amd64',
    dir: '.',
    dataDir: '.',
    storage: {
      get: (k) => kv.get(k),
      set: (k, v) => kv.set(k, v),
      remove: (k) => kv.delete(k),
    },
    setting: (k) => (cfg.has(k) ? String(cfg.get(k)) : ''),
    language: () => 'zh-CN',
    t: (text) => text,
    openURL: (url) => opened.push(url),
    signInPrompt: (o) => prompts.push(o),
    crypto: {
      md5: (text) => createHash('md5').update(text, 'utf8').digest('hex'),
      aesEcbEncrypt: () => {
        throw new Error('not implemented in tests');
      },
    },
  };

  return { kv, cfg, opened, prompts };
}

export function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
