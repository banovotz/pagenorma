---
layout: support-article
title: My analysis did not start or failed
description: A checklist of what to check when Analyze Text does nothing or stops with an error.
category: Troubleshooting
category_slug: troubleshooting
permalink: /support/troubleshooting/analysis-did-not-start-or-failed/
nav_order: 2
tags: [analysis, error, troubleshooting, OCR]
applies_to: [pagenorma S, pagenorma QS]
last_modified_at: '2026-10-20'
related: [/support/analysis/run-an-analysis/, /support/troubleshooting/hugging-face-errors/, /support/usage/when-you-reach-your-limit/]
---

Work through this checklist from the top.

## 1. Account and allowance

- Are you signed in with a [verified email]({% link support/account/verify-your-email.md %})?
- On pagenorma S, is Hugging Face [connected]({% link support/connections/connect-hugging-face.md %})?
- Do you have allowance or tokens left? See [Monthly allowance]({% link support/usage/monthly-allowance.md %}).

## 2. The project has text

| Message | What to do |
|---|---|
| *Source text was not found. Open the project for editing, select the ePub/PDF file again, and save the project.* | The source text was not saved. Do exactly what the message says. |
| *Translation text was not found.* | Check the translation source. Use **Refresh Translation** or choose the document again. |
| *The ePub file could not be processed. The project will be saved without source text.* | Try the file again or a different copy. |

## 3. The page selection

| Message | What to do |
|---|---|
| *The selected pages hold no analysable text. Widen the range and try again.* | Choose more pages. |
| *The selected pages changed since this run was set up.* | Close the dialog and start again. |
| *The charged page count did not match the selected pages. Nothing was recorded; close the dialog and try again.* | Nothing was charged. Close the dialog and start again. |

## 4. Results

- *The analysis provider returned an empty glossary.* — Try again, or analyse fewer pages.
- *The analysis was unsuccessful.* — The message after it gives the reason. If it mentions Hugging Face, see [Hugging Face errors]({% link support/troubleshooting/hugging-face-errors.md %}).

## 5. General tips

- Keep the browser open and the device awake during a run.
- Large runs take time. Check the estimate in the dialog.
- If a run stops part-way, run it again with the remaining pages.
- If the PDF or OCR library has not loaded, refresh the page and try again.
