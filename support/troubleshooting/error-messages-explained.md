---
layout: support-article
title: Error messages explained
description: A reference of other common pagenorma messages, what they mean and what to do.
category: Troubleshooting
category_slug: troubleshooting
permalink: /support/troubleshooting/error-messages-explained/
nav_order: 5
tags: [errors, messages, reference]
applies_to: [pagenorma S, pagenorma QS]
last_modified_at: '2026-10-20'
related: [/support/troubleshooting/analysis-did-not-start-or-failed/, /support/troubleshooting/hugging-face-errors/, /support/troubleshooting/google-picker-blank-or-asks-to-sign-in/]
---

Messages for analysis, Hugging Face and Google are covered in their own articles. Others are listed here.

## Projects and files

| Message | What to do |
|---|---|
| *Please select an ePub/PDF file and a translation source…* | Choose a source file and a translation, then click **Fetch Data** again. |
| *Supported formats are DOCX, RTF, ODT and TXT.* | Convert your translation file to one of these. |
| *Selected document contains no text.* / *File … does not contain the expected content.* | Open the file elsewhere to check it, re-save it, and try again. |
| *No translation file selected.* | Choose the file first. |
| *The document contains invalid XML.* | The file is damaged. Re-save it from your word processor. |
| *The PDF library has not loaded.* / *The OCR library has not loaded.* | Refresh the page and check your connection. These libraries load from the internet. |
| *An error occurred: …* (during fetch) | The text after the colon gives the reason. Check your files and connection. |
| *Error saving project: …* | Check that all required fields are filled in and try again. |

## Account

| Message | What to do |
|---|---|
| *You must accept the Terms of Use and Privacy Policy to create an account.* | Tick the box on the registration form. |
| *Enter your email address and password.* | Fill in both fields. |
| *Check your email and verify your account before starting text analysis.* | See [Verify your email address]({% link support/account/verify-your-email.md %}). |
| *Authentication failed: …* | Check your email and password, or use *Forgot password?* |
| *Google authentication failed: …* / *Hugging Face sign-in failed: …* | Allow pop-ups and try again. |
| *Firebase is currently unavailable.* | The account service did not load. Check your connection and reload. |
| *Your account could not be deleted: …* | Sign in again and retry. |

## Thesaurus

| Message | What to do |
|---|---|
| *Enter a search term.* | Type a word first. |
| *Sign in with a verified account to use the thesaurus.* | Sign in and verify your email. |
| *Not enough tokens are left for the thesaurus…* | See [When you reach your limit]({% link support/usage/when-you-reach-your-limit.md %}). |
| *Search failed. Please try again.* | Try again in a moment. |

## Backup

See [Back up and restore your data]({% link support/data/back-up-and-restore.md %}).
