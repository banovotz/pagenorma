---
layout: support-article
title: Connect Hugging Face (pagenorma S)
description: Connect your free Hugging Face account in one click, or add an access token manually, so pagenorma S can run AI analysis.
category: Connections
category_slug: connections
permalink: /support/connections/connect-hugging-face/
nav_order: 3
tags: [Hugging Face, token, AI, pagenorma S, settings]
applies_to: [pagenorma S]
last_modified_at: '2026-10-20'
related: [/support/troubleshooting/hugging-face-errors/, /support/getting-started/plans-pagenorma-s-and-qs/, /support/data/privacy-and-ai-processing/]
---

On pagenorma S, the AI features run through your own Hugging Face account. pagenorma QS users do not need this step.

## Connect in one click

1. Open **Settings** and find **Hugging Face analysis token**.
2. Click **Connect with Hugging Face** and approve the request in the pop-up.
3. The card then shows that you are connected.

If you are not signed in to pagenorma, connecting also signs you in. If you are signed in, Hugging Face is added as another [sign-in method]({% link support/account/sign-in-methods.md %}).

## Add a token manually

1. Create a fine-grained token on [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) and allow it **inference** access.
2. In **Settings**, tick **I want to insert Hugging Face token manually**.
3. Paste the token (it starts with `hf_`) and click **Save Hugging Face token**.

pagenorma confirms that the token was saved on this device.

## Where the token is kept

Your token stays only in this browser. It is not stored in your pagenorma account.

## Renew or disconnect

- A connection made with **Connect with Hugging Face** expires after a while. The card then says the session has expired. Click **Connect with Hugging Face** again to renew it.
- Click **Disconnect** to remove a connection made with **Connect with Hugging Face** from this browser.

## Also needed for AI features

You need a verified account and some allowance left. See [Monthly allowance]({% link support/usage/monthly-allowance.md %}) and [Verify your email address]({% link support/account/verify-your-email.md %}).
