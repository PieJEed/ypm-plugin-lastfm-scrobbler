// 播放状态机：把「每 4 秒一次的播放快照」换算成「开始播放」「该 scrobble」两种事件。
// 这里不联网，方便单独测试。

const MAX_STEP_MS = 15000; // 两次轮询之间最多按 15 秒计，防止应用被挂起后一次性补记
const NOW_PLAYING_RESEND_MS = 30 * 60 * 1000;

function keyOf(track) {
  const id = track.id ? `${track.source || ''}:${track.id}` : '';
  return id || `${track.title}\u0000${track.artist}`;
}

function needMs(duration, mode) {
  if (mode === 'standard' || !mode) return Math.min(duration / 2, 240000);
  return duration * mode;
}

export class Tracker {
  constructor({ mode = 'standard' } = {}) {
    this.mode = mode;
    this.session = null;
  }

  /// 导入上次保存的状态（应用重启后不重复 scrobble）。
  restore(state) {
    this.session = state || null;
  }

  snapshot() {
    return this.session;
  }

  reset() {
    this.session = null;
  }

  /// snap: get_now_playing 的原始返回；at: 本地时间戳（毫秒）。
  /// 返回 { nowPlaying?: track, scrobble?: entry }，scrobble 只在刚跨过门槛时给一次。
  observe(snap, at = Date.now()) {
    const out = {};
    const t = snap && snap.track;
    if (!t || !t.title || !t.artist) {
      if (this.session) this.session = null;
      return out;
    }

    const duration = Math.max(0, Number(t.duration || snap.duration || 0) * 1000);
    const position = Math.max(0, Number(snap.position || 0) * 1000);
    const playing = !!snap.playing;
    const key = keyOf(t);
    const s = this.session;

    // 只有「回到开头」才算新的一遍：单曲循环、点重播都会走这里。
    // 中途往回拖几十秒仍然是同一遍播放，不重复上报。
    const restarted = s && (s.key !== key || (position < 5000 && s.lastPos > 20000));
    if (!s || restarted) {
      this.session = {
        key,
        title: t.title,
        artist: t.artist,
        album: t.album || '',
        duration,
        source: t.source || '',
        id: t.id || '',
        startedAt: Math.max(0, Math.floor((at - position) / 1000)),
        listened: Math.min(position, duration || position),
        lastPos: position,
        lastAt: at,
        wasPlaying: playing,
        nowPlayingAt: 0,
        scrobbled: false,
      };
      if (playing) {
        this.session.nowPlayingAt = at;
        out.nowPlaying = this.nowPlaying();
      }
      return out;
    }

    const step = Math.max(0, Math.min(at - s.lastAt, MAX_STEP_MS));
    if (playing && s.wasPlaying) s.listened += step;
    if (duration) s.listened = Math.min(s.listened, duration);
    s.lastPos = Math.max(s.lastPos, position);
    s.lastAt = at;
    s.wasPlaying = playing;

    if (playing && (!s.nowPlayingAt || at - s.nowPlayingAt > NOW_PLAYING_RESEND_MS)) {
      s.nowPlayingAt = at;
      out.nowPlaying = this.nowPlaying();
    }

    if (!s.scrobbled && s.duration > 30000 && s.listened >= needMs(s.duration, this.mode)) {
      s.scrobbled = true;
      out.scrobble = { ...this.entry(), timestamp: s.startedAt };
    }
    return out;
  }

  nowPlaying() {
    const s = this.session;
    if (!s) return null;
    return { title: s.title, artist: s.artist, album: s.album, duration: s.duration };
  }

  entry() {
    const s = this.session;
    if (!s) return null;
    return {
      title: s.title,
      artist: s.artist,
      album: s.album,
      duration: s.duration,
      source: s.source,
      id: s.id,
      timestamp: s.startedAt,
    };
  }
}
