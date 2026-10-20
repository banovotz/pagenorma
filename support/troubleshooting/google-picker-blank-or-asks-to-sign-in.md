---
layout: support-article
title: The Google picker is blank or keeps asking me to sign in
description: Fix a blank Google Docs picker, repeated sign-in prompts and "access denied" errors when choosing or refreshing a Google Doc.
category: Troubleshooting
category_slug: troubleshooting
permalink: /support/troubleshooting/google-picker-blank-or-asks-to-sign-in/
nav_order: 1
tags: [Google picker, cookies, Brave, Google Docs, troubleshooting]
applies_to: [pagenorma S, pagenorma QS]
last_modified_at: '2026-10-20'
related: [/support/connections/connect-google-docs/, /support/projects/refresh-translation/]
---

## Symptoms

- The **Choose Google Doc…** window is blank.
- Google keeps asking you to sign in, or your choice never returns to pagenorma.
- A yellow note appears under the Google Docs field about third-party cookies.

## Cause

Google's picker needs third-party cookies to work. Some browsers block them by default, especially privacy-focused ones.

## Fix

1. Allow cookies for Google for this site.
   - **Brave:** click the lion icon in the address bar and choose **Allow all cookies**.
   - **Other browsers:** open the site's cookie or privacy settings and allow third-party cookies for Google.
2. Reload pagenorma and try **Choose Google Doc…** again.
3. If it still fails, try **Chrome**.

You can dismiss the note with **×**. It does not come back, and it also disappears once picking works.

## Other messages

| Message | What to do |
|---|---|
| *Google denied access to the document. Pick the document again with "Choose Google Doc"…* | pagenorma can read only documents you pick. Pick this document again from **Edit**. |
| *Google Picker is unavailable. Check your internet connection.* | Check your connection, disable any blocker for Google, and reload. |
| *Google Picker could not be loaded.* | Reload the page and try again. |
| *Invalid Google Docs document.* | The link is not a Google Doc. Use **Choose Google Doc…** and pick a Google Docs file. |
| The picker shows no documents | Only Google Docs files are listed. Check you are signed in to the Google account that owns the document. |

Pop-up blockers can also stop the Google window from opening. Allow pop-ups for pagenorma.
