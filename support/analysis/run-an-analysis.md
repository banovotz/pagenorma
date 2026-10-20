---
layout: support-article
title: Run an AI analysis
description: Start an analysis of a project, choose the glossary and/or commentary, and follow its progress.
category: AI Translation Analysis
category_slug: analysis
permalink: /support/analysis/run-an-analysis/
nav_order: 1
tags: [analysis, AI, glossary, commentary, Analyze Text]
applies_to: [pagenorma S, pagenorma QS]
last_modified_at: '2026-10-20'
related: [/support/analysis/choose-pages-to-analyse/, /support/analysis/how-ai-commentary-works/, /support/usage/monthly-allowance/, /support/troubleshooting/analysis-did-not-start-or-failed/]
---

An analysis compares your translation with the source, paragraph by paragraph, and can also build a glossary of key terms.

## Before you start

- The project needs its source text and its translation text. Fetch them when you [create the project]({% link support/projects/create-a-project.md %}), or use [Refresh Translation]({% link support/projects/refresh-translation.md %}).
- You must be signed in with a [verified email address]({% link support/account/verify-your-email.md %}).
- On pagenorma S, [connect Hugging Face]({% link support/connections/connect-hugging-face.md %}).
- You need allowance or tokens left. See [Monthly allowance]({% link support/usage/monthly-allowance.md %}).

## Steps

1. On the Dashboard, click **Analyze Text** on the project card.
2. In the **AI Translation Analysis** dialog, choose what to create:
   - **Glossary** — the list of key terms and their translations, with quality assessments.
   - **Commentary analysis** — the paragraph-by-paragraph AI comments.

   You must tick at least one. If you do not, the dialog reminds you.
3. Optionally limit the run to certain pages. See [Choose pages to analyse]({% link support/analysis/choose-pages-to-analyse.md %}).
4. Click **Start Selected**.

## While it runs

A progress bar and status messages show what is happening, with an estimated total and remaining time. **Keep the browser open** until it finishes. Closing it interrupts the run.

When it is done, the result is saved on your device. Open it from **Translation Analyses**. See [Read the side-by-side view]({% link support/analysis/read-the-side-by-side-view.md %}).

## What a run costs

Each phase uses the matching part of your allowance, and pages are counted only after a phase finishes. A glossary-only run uses glossary pages and does not use analysis pages. If you have less allowance than the pages you chose, pagenorma tells you before starting; see [When you reach your limit]({% link support/usage/when-you-reach-your-limit.md %}).

## Run it again

You can run an analysis again at any time, for example after refreshing your translation. A new run updates the saved analysis for that project.
