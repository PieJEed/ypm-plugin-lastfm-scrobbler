# Changelog

## 1.0.0 - 2026-11-24

- 首个版本：通过 YesPlayMusic 本地 MCP 读取播放状态，同步 now playing 与 scrobble 到 Last.fm。
- 支持 Last.fm 桌面授权（`auth.getToken` → 浏览器授权 → `auth.getSession`），登录状态本地保存。
- 按 Last.fm 规则判断（长于 30 秒，听满一半或 4 分钟），支持严格 / 几乎听完两档。
- 暂停不计时，单曲循环与重新播放按新的一遍计算，中途拖动不重复上报。
- 离线队列（最多 500 条，60 秒重试，超过 14 天丢弃）。
