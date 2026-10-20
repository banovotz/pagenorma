---
layout: support-article
title: Connect Google Docs
description: Pick a Google Doc as your translation source, what pagenorma can access and how to disconnect.
category: Connections
category_slug: connections
permalink: /support/connections/connect-google-docs/
nav_order: 1
tags: [Google Docs, Google Drive, picker, connection]
applies_to: [pagenorma S, pagenorma QS]
last_modified_at: '2026-10-20'
related: [/support/troubleshooting/google-picker-blank-or-asks-to-sign-in/, /support/projects/refresh-translation/, /support/connections/use-a-document-file/]
---

If you write your translation in Google Docs, pagenorma can read it directly, so progress and earnings stay up to date.

## Pick a document

1. Open the project form (**New Project**, or **Edit** on an existing project).
2. On the **Translation Google Doc** tab, click **Choose Google Doc…**.
3. Sign in to Google if asked, then select the document in the Google picker.

The form then shows *Selected document* with the document's name. Save the project.

## Authenticate ahead of time (optional)

In **Settings → Private Google Docs**, click **Authenticate Google Drive**. This is optional, because authentication also happens automatically when you pick a document. When it succeeds, pagenorma says *Google Drive authenticated. Choose a Google Doc in a project to grant access.*

## What pagenorma can access

- Only the Google Docs files you pick. pagenorma is never given access to the rest of your Drive, and the picker shows only Google Docs files.
- The access token is kept only for the current browser session.

## Disconnect

In **Settings → Private Google Docs**, click **Sign out**. pagenorma then says *Google Drive authentication removed.* You will be asked to pick a document again the next time you refresh.

## Trouble?

If the picker is blank or keeps asking you to sign in, see [Google picker is blank or keeps asking me to sign in]({% link support/troubleshooting/google-picker-blank-or-asks-to-sign-in.md %}).
