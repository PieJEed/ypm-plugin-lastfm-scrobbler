# YesPlayMusic → Last.fm Scrobbler

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![test](https://github.com/PieJEed/ypm-lastfm-scrobbler/actions/workflows/test.yml/badge.svg)](https://github.com/PieJEed/ypm-lastfm-scrobbler/actions/workflows/test.yml)

A YesPlayMusic 3.x plugin that keeps your Last.fm profile up to date: now playing and scrobbles.

Not affiliated with YesPlayMusic or Last.fm.

## Features

- Sends `track.updateNowPlaying` when a new track starts (optional).
- Scrobbles using Last.fm's rule: longer than 30 seconds, played for at least half its length or 4 minutes, whichever comes first.
- Uses the real track start time as the scrobble timestamp.
- Pauses don't count, repeats count as new plays, small seeks don't duplicate scrobbles.
- Offline queue (up to 500 entries, retried every 60 s, entries older than 14 days dropped).

## Install

In YesPlayMusic: Settings → Plugins → Install plugin, paste:

```
github.com/PieJEed/ypm-lastfm-scrobbler
```

Or copy the `plugin` folder to `%APPDATA%\YesPlayMusic\plugins\lastfm-scrobbler` on Windows
(see `install.ps1`), then click **Reload** in Settings → Plugins.

## Setup

1. Enable **Settings → MCP → local MCP server** (default `http://127.0.0.1:18888`).
2. Create a Last.fm API account at <https://www.last.fm/api/account/create>. The callback URL is unused by this plugin — any valid URL works.
3. Open the plugin settings, fill in the API key and shared secret, then click **Sign in** and approve the request in your browser.

## Why MCP?

YesPlayMusic 3.0.0 declares a `played({ id })` plugin hook but never calls it, so a plugin cannot observe playback. This plugin polls the app's own local MCP tool `get_now_playing` every 4 seconds instead, and keeps its own playback state machine. If a future release wires `played` up, this plugin already implements it as a refresh trigger.

## Privacy

Only `127.0.0.1` and `ws.audioscrobbler.com` are contacted. Credentials and the session key are stored by YesPlayMusic under `%APPDATA%\YesPlayMusic\plugin-data\lastfm-scrobbler\`.
