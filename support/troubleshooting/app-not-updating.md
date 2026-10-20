---
layout: support-article
title: The app is not updating or shows an old version
description: Refresh pagenorma safely when it seems stuck on an older version, without losing your projects.
category: Troubleshooting
category_slug: troubleshooting
permalink: /support/troubleshooting/app-not-updating/
nav_order: 4
tags: [update, cache, service worker, refresh]
applies_to: [pagenorma S, pagenorma QS]
last_modified_at: '2026-10-20'
related: [/support/getting-started/install-pagenorma-as-an-app/, /support/data/back-up-and-restore/]
---

pagenorma updates itself, and fetches the latest version of its files each time you open it. If something looks outdated, try these steps in order.

1. **Close and reopen.** Close every pagenorma tab, or quit the installed app, then open it again.
2. **Hard refresh.** Press **Ctrl+Shift+R** (Windows, Linux) or **Cmd+Shift+R** (Mac). On a phone, close the app completely and open it again.
3. **Check your connection.** Offline, pagenorma can only show the last version stored on your device.

## Last resort: clear the app's cache

> **Back up first.** Clearing all site data deletes your projects, because they are stored in the same place. [Export a backup]({% link support/data/back-up-and-restore.md %}) before you clear anything.

In your browser's developer tools (Application tab), unregister pagenorma's service worker and clear the cached files, then reload. Do not use the option that clears *all* site data unless you have a backup.
