---
layout: support-article
title: Hugging Face errors (pagenorma S)
description: What each Hugging Face message means and how to fix connection, token, rate-limit and size problems.
category: Troubleshooting
category_slug: troubleshooting
permalink: /support/troubleshooting/hugging-face-errors/
nav_order: 3
tags: [Hugging Face, token, errors, pagenorma S]
applies_to: [pagenorma S]
last_modified_at: '2026-10-20'
related: [/support/connections/connect-hugging-face/, /support/analysis/choose-pages-to-analyse/]
---

| Message | Meaning and fix |
|---|---|
| *You haven't connected Hugging Face or entered an access token in the settings.* | Go to **Settings → Hugging Face analysis token** and [connect]({% link support/connections/connect-hugging-face.md %}) or add a token. |
| *Your Hugging Face connection has expired. Click "Connect with Hugging Face" in Settings to renew it.* | Connections expire. Click **Connect with Hugging Face** again. |
| *You are not authorized. Please check your Hugging Face access token in the settings.* | The token is wrong or lacks permission. Make sure it is a fine-grained token with inference access, and save it again. |
| *Hugging Face did not return an inference access token. Please try connecting again.* | The connection did not complete. Try again. |
| *Hugging Face response reached the output token limit.* | The batch was too large for the model. Analyse a smaller page range. |
| *Hugging Face returned no analysis content.* | Try again, or choose fewer pages. |
| *Hugging Face request failed with HTTP …* | A temporary problem on Hugging Face's side. |

## Busy servers

When Hugging Face is busy or rate-limits requests, pagenorma retries automatically, up to five times, waiting longer each time. A run may therefore pause for a while before it continues. If it still fails, wait a few minutes and run again.

## Still stuck?

[Disconnect and reconnect]({% link support/connections/connect-hugging-face.md %}), and check that your Hugging Face account is in good standing.
