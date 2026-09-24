---
layout: page
title: Privacy Policy | pagenorma
permalink: /privacy/
description: Learn how pagenorma respects your privacy, handles your book translation projects, and protects your local data.
---

*Last updated: September 24, 2026*

At **pagenorma**, we believe the texts and translations you work with belong to you. This Privacy Policy explains how pagenorma processes information when you use the application, including optional Google Docs import and Gemini-powered analysis features.

## 1. Information Stored on Your Device

pagenorma is designed to operate primarily in your browser.

- **Local project data:** Projects, source and translated text, glossary data, concordance indexes, settings, and related workspace data may be stored in your browser’s local storage or IndexedDB on your device. Where supported, pagenorma may request persistent browser storage to reduce the risk that the browser automatically removes this data.
- **No pagenorma manuscript-content server:** pagenorma does not operate a server that stores copies of your manuscript text, translations, glossary data, or concordance indexes.
- **Your control:** You can remove locally stored project data through the application where available, or by clearing pagenorma’s site data in your browser. Clearing site data may remove saved projects, settings, and your saved Gemini API key.

## 2. Google Docs Import

If you choose to import a Google Docs document, pagenorma requests the Google OAuth scope `https://www.googleapis.com/auth/documents.readonly`.

This permission allows pagenorma to read Google Docs that are available to the Google account you choose during authorization. pagenorma uses this permission only when you provide a Google Docs URL for import. It extracts the document ID from that URL and retrieves the document content through the Google Docs API so that it can be imported into your workspace or used in the analysis feature you selected.

pagenorma does not use this permission to create, edit, delete, share, organize, upload, download, or list your Google Drive files. It does not use Google Docs data for advertising or sell Google Docs data.

Google access tokens are stored only for the current browser session. You can disconnect Google Docs from pagenorma’s settings; disconnecting removes the locally stored access token and requests revocation of that token. You can also remove pagenorma’s access through your Google Account’s third-party access settings.

## 3. Gemini-Powered Analysis

When you choose an AI-powered feature, such as concordance support, glossary extraction, QA, commentary, or side-by-side verification, pagenorma sends the text necessary to perform that selected feature to the Google Gemini API.

- **Your Gemini API key:** Requests are made using the Gemini API key that you provide. The key is stored in your browser’s local storage on your device and is used to make Gemini API requests on your behalf.
- **Purpose of processing:** pagenorma uses submitted text to produce the analysis, commentary, glossary extraction, or verification that you request.
- **No pagenorma AI-content server:** pagenorma does not operate a server that stores copies of text submitted to the Gemini API or copies of your Gemini API key.
- **Google’s processing:** Google’s handling, logging, retention, and use of information sent to the Gemini API are governed by the applicable Google Gemini API terms and privacy documentation. Please review those terms before submitting confidential, personal, or proprietary information.

## 4. Third-Party Services

pagenorma uses Google services when you choose the related optional features:

- **Google Docs API and Google OAuth** to authorize and retrieve the Google Docs document URL that you choose to import.
- **Google Gemini API** to provide the AI-powered features that you choose to use.

We do not sell or rent your personal information or manuscript content.

## 5. Subscription and Account Information

pagenorma is temporarily offered free of charge without functional limitations. We reserve the right to introduce tiered service plans. Core functionality will remain accessible under a free tier, while enhanced features may require an active pagenorma QS subscription.

## 6. Changes to This Privacy Policy

We may update this Privacy Policy to reflect changes to pagenorma, our service providers, or applicable legal requirements. We will post the updated policy on this page and revise the “Last updated” date.

## 7. Contact Us

For questions about this Privacy Policy, Google Docs access, deletion of locally stored data, or privacy requests, contact us at [pagenorma@ypagenorma.eu] or visit  <a href="{{ '/contact/' | relative_url }}">our contact page.</a>
