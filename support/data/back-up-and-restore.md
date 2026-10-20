---
layout: support-article
title: Back up and restore your data
description: Export your projects and analyses to a JSON file and restore them, including what a backup contains and what it replaces.
category: Your Data, Backup & Privacy
category_slug: data
permalink: /support/data/back-up-and-restore/
nav_order: 2
tags: [backup, restore, export, import, JSON]
applies_to: [pagenorma S, pagenorma QS]
last_modified_at: '2026-10-20'
related: [/support/data/where-your-data-is-stored/, /support/earnings/set-up-deductions/, /support/troubleshooting/error-messages-explained/]
---

A backup is a single JSON file with everything stored in your pagenorma database.

## Export a backup

1. Open **Settings**.
2. In **Database Backup (Export & Import)**, click **Export Database (JSON)**.
3. Your browser downloads a file named `pagenorma_backup_2026-10-20.json`, with the current date.

Keep it somewhere safe, such as a cloud drive.

## What is in it

Your projects (including the source and translation text), their entries, and your saved analyses.

## What is not in it

- Your deduction settings. See [Set up your deductions]({% link support/earnings/set-up-deductions.md %}).
- Your Hugging Face token and your Google connection.
- Your account data. That stays in your pagenorma account.

## Restore a backup

1. Open **Settings**.
2. Click **Import Database** and choose a backup file.
3. When you see *Backup successfully restored!*, check your Dashboard.

> **Importing replaces everything.** The current projects, entries and analyses in this browser are cleared first and replaced with the contents of the file. If you have newer work, export a backup before you import.

## Messages

- *Backup export failed.* — try again; if it keeps failing, free some disk space or try another browser.
- *Failed to load backup. Ensure the file is valid JSON.* — the file is damaged or not a pagenorma backup.
- *File structure is invalid.* — the file does not contain pagenorma data.

## Handle with care

A backup contains the full text of your books and translations. Store it as carefully as the documents themselves.

## Move to a new device

1. Export a backup on the old device.
2. Open pagenorma on the new device and sign in. Your allowance and tokens follow your account.
3. Import the backup.
4. Re-enter your deduction settings and reconnect Hugging Face if you use it.
