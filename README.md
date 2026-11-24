# YesPlayMusic → Last.fm 记录同步

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![test](https://github.com/PieJEed/yesplaymusic-lastfm-scrobbler/actions/workflows/test.yml/badge.svg)](https://github.com/PieJEed/yesplaymusic-lastfm-scrobbler/actions/workflows/test.yml)
![YesPlayMusic](https://img.shields.io/badge/YesPlayMusic-3.0.0%2B-6E56CF)
![Last.fm](https://img.shields.io/badge/Last.fm-scrobble-D51007)

把 YesPlayMusic 的播放记录同步到 Last.fm：开始播放时更新「正在播放」，听够了自动 scrobble。

> 非官方插件，与 YesPlayMusic、Last.fm 均无隶属关系。

## 功能

- **正在播放**：切歌时调用 `track.updateNowPlaying`（可以关掉）。
- **自动 scrobble**：按 Last.fm 官方规则，歌长超过 30 秒且听满一半或 4 分钟（先到为准）。
- **准确的开始时间**：scrobble 的时间戳是这首歌开始播放的时间，不是提交时间。
- **暂停不计时**：暂停、挂起、切歌都不会多算；单曲循环和点重播按新的一遍计算。
- **拖动不重复**：同一遍播放里往回拖几十秒，不会被当成第二次播放。
- **离线队列**：网络失败时先存本地（最多 500 条），每 60 秒重试，超过 14 天的旧记录丢弃。
- **可选门槛**：标准（一半 / 4 分钟）、严格（80%）、几乎听完（95%）。

## 安装

### 方式一：应用内安装（推荐）

YesPlayMusic → 设置 → 插件 → 安装插件，粘贴：

```
github.com/PieJEed/yesplaymusic-lastfm-scrobbler
```

应用会优先使用最新 Release 里的 `lastfm-scrobbler-*.zip` 附件。

### 方式二：本地脚本

下载仓库后，在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### 方式三：手动复制

把 `plugin` 文件夹复制到 `%APPDATA%\YesPlayMusic\plugins\lastfm-scrobbler`。

装完回到 设置 → 插件 点 **重新加载**，列表里会出现「Last.fm 记录同步」。

这个插件不是音乐源，不会出现在「音乐来源」里，也不影响原来的 QQ 音乐 / 本地音乐插件。

## 首次配置

### 1. 打开本地 MCP 服务

设置 → MCP → 勾选 **启用本地 MCP 服务**（默认端口 `18888`，只监听 `127.0.0.1`）。

插件需要它来读取当前播放的歌曲和进度（原因见下一节）。

### 2. 创建 Last.fm API 账号

打开 <https://www.last.fm/api/account/create>，填写应用名（例如 `YesPlayMusic`）和描述。

**回调地址**随便填一个合法的 URL 即可，例如 `http://127.0.0.1:18888/`。本插件使用桌面授权流程，这个地址不会被访问。

创建后会得到 **API key** 和 **Shared secret**。

### 3. 填写插件设置并登录

在插件卡片上点 **设置**：

| 设置 | 填什么 |
| --- | --- |
| YesPlayMusic MCP 地址 | 默认 `http://127.0.0.1:18888`，改过端口才需要动 |
| Last.fm API Key | 上一步的 API key |
| Last.fm Shared Secret | 上一步的 Shared secret |
| MCP Bearer Token | 只有开启「要求 Bearer Token」时才需要填 |
| 计入播放的条件 | 一般保持标准即可 |
| 不上报「正在播放」 | 只记录听过的歌时勾选 |

然后点 **登录**：浏览器会打开 Last.fm 授权页，点 **Allow access**，回到应用，几秒内自动完成。

登录状态保存在插件数据目录，重启应用不用重新授权。

## 为什么需要开启 MCP

插件文档里有一个 `played({ id })`，说明是「一首歌播放了，可以用来上报听歌记录」。但 YesPlayMusic 3.0.0 里**没有任何地方调用它**：

- `lib/music/source.dart:119` 只是空实现 `Future<void> played(Track track) async {}`
- `lib/plugin/plugin_source.dart:583` 只是把它转发给插件
- 全仓库搜索 `played(`，除了这两处定义没有第三个调用点

所以纯插件收不到播放事件。这个插件改为每 4 秒读一次应用自带的本地 MCP 服务里的 `get_now_playing`（当前歌曲、进度、是否在播），自己维护播放状态机。这是 3.0.0 里唯一能拿到播放进度的官方接口。

如果以后上游把 `played` 接上，本插件也已经实现了它：会立刻刷新一次状态，不会重复记录。

## 数据与隐私

| 内容 | 位置 |
| --- | --- |
| 插件设置（API Key / Secret / Token） | `%APPDATA%\YesPlayMusic\plugin-data\lastfm-scrobbler\settings.json` |
| 登录状态、待上报队列、统计 | `%APPDATA%\YesPlayMusic\plugin-data\lastfm-scrobbler\storage.json` |

- 只访问 `127.0.0.1`（读播放状态）和 `ws.audioscrobbler.com`（Last.fm API）。
- 不读取、不上传本地文件、歌单或账号密码。
- Secret 和 Session Key 由应用明文保存在上面的文件里，请不要把这两个文件发给别人。

## 常见问题

**登录不上 / 提示 setup**
先填 API Key 和 Shared Secret 再点登录。浏览器里只登录 Last.fm 不算授权，必须点 **Allow access**。

**日志里一直说读不到播放状态**
1. 设置 → MCP 是否已启用，端口是否和插件设置一致；
2. 浏览器打开 `http://127.0.0.1:18888/health`，应返回 `{"ok":true,...}`；
3. 如果开了「要求 Bearer Token」，把设置页给出的 Token 填到插件的「MCP Bearer Token」里。

**听完了但 Last.fm 没有记录**
- 歌曲短于 30 秒不会记录；
- 没听够一半就切歌不会记录；
- 用 PowerShell 启动 `YesPlayMusic.exe`，控制台里 `[lastfm]` 开头的日志会打印上报结果和错误；
- 刚登录时如果正在播放，插件要等下一首才开始计入。

**重复记录**
同一首歌连续听两遍会产生两条记录（时间戳不同），这是正常的；同一遍播放不会重复提交。

**为什么不在「音乐来源」里**
它不是音乐源，只负责上报。YesPlayMusic 只把提供搜索 / 音乐库的插件列进「音乐来源」。

## 开发

```bash
node --test        # 单元测试 + 用假 MCP / 假 Last.fm 的端到端测试
npm run package    # 生成 dist/lastfm-scrobbler-1.0.0.zip
```

测试覆盖：Last.fm 文档里的签名示例、批量参数的 ASCII 排序、30 秒 / 一半 / 4 分钟规则、暂停、单曲循环、切歌、恢复状态去重、应用挂起、离线队列，以及一条从 MCP 快照到 scrobble 请求的完整链路。

### 目录

```
plugin/            插件本体（复制到 YesPlayMusic 的就是这个目录）
  index.js         轮询、队列、错误处理、导出的 account / signIn / signOut
  tracker.js       纯状态机：什么时候算听过、什么时候 scrobble
  lastfm.js        Last.fm 签名、授权、updateNowPlaying、scrobble
  mcp.js           本地 MCP 的 Streamable HTTP 客户端
  locales/         zh-CN / en 文案
test/              node:test 测试
test-support/      测试用的宿主模拟
scripts/           打包脚本
install.ps1        安装到本机 YesPlayMusic
```

## License

[MIT](LICENSE)
