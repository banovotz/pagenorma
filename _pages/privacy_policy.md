---
layout: page
title: Privacy Policy | pagenorma
permalink: /privacy/
description: Learn how pagenorma respects your privacy, handles your book translation projects, and protects your local data.
---

*Last updated: October 7, 2026*

At **pagenorma**, we believe the texts and translations you work with belong to you. This Privacy Policy explains how pagenorma processes information when you use the application, including optional Google Docs import and Hugging Face-powered analysis features.

## 1. Information Stored on Your Device

pagenorma is designed to operate primarily in your browser.

- **Local project data:** Projects, source and translated text, glossary data, concordance indexes, settings, and related workspace data may be stored in your browser’s local storage or IndexedDB on your device. Where supported, pagenorma may request persistent browser storage to reduce the risk that the browser automatically removes this data.
- **No pagenorma manuscript-content server:** pagenorma does not operate a server that stores copies of your manuscript text, translations, glossary data, or concordance indexes.
- **Your control:** You can remove locally stored project data through the application where available, or by clearing pagenorma’s site data in your browser. Clearing site data may remove saved projects, settings, and your saved Hugging Face API key.


## 2. Google Integration

pagenorma uses Google services for authentication and optional document import.

### Account Authentication (Sign-In with Google)
If you choose to sign in to pagenorma using your Google account, we request basic profile scopes (`openid`, `email`, `profile`). 

This information is used strictly to authenticate your identity, create or manage your local user session, and display your basic profile information (such as your email address) within the application interface. We do not use your personal profile data for marketing, nor do we share or sell it to third parties.

### Google Docs Import

If you choose to import a Google Docs document, pagenorma requests the Google OAuth scope `https://www.googleapis.com/auth/documents.readonly`.

This permission allows pagenorma to read Google Docs that are available to the Google account you choose during authorization. pagenorma uses this permission only when you provide a Google Docs URL for import. It extracts the document ID from that URL and retrieves the document content through the Google Docs API so that it can be imported into your workspace or used in the analysis feature you selected.

pagenorma does not use this permission to create, edit, delete, share, organize, upload, download, or list your Google Drive files. It does not use Google Docs data for advertising or sell Google Docs data.

Google access tokens are stored only for the current browser session. You can disconnect Google Docs from pagenorma’s settings; disconnecting removes the locally stored access token and requests revocation of that token. You can also remove pagenorma’s access through your Google Account’s third-party access settings.

## 3. AI-Powered Analysis

When you choose an AI-powered feature, such as concordance support, glossary extraction, QA, commentary, or side-by-side verification, pagenorma sends the text necessary to perform that selected feature to the Hugging Face inference API.

- **Your API key:** Requests are made using the Hugging Face API key that you provide. The key is stored in your browser’s local storage on your device and is used to make Hugging Face API requests on your behalf.
- **Purpose of processing:** pagenorma uses submitted text to produce the analysis, commentary, glossary extraction, or verification that you request.
- **No pagenorma AI-content server:** pagenorma does not operate a server that stores copies of text submitted to the Hugging Face API or copies of your Hugging Face API key.
- **Data processing:** Handling, logging, retention, and use of information sent to the Hugging Face API are governed by the applicable Hugging Face API terms and privacy documentation (see <a href="https://huggingface.co/docs/inference-providers/en/security" target="_blank" rel="noopener">Hugging Face Security & Compliance</a>). Please review those terms before submitting confidential, personal, or proprietary information.

pagenorma’s use and transfer to any other app of information received from Google APIs will adhere to <a href="https://developers.google.com/site-policies/acc-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, including the Limited Use requirements.

## 4. Third-Party Services

pagenorma uses third party services when you choose the related optional features:

- **Google OAuth (Authentication):** To authenticate your user account and manage secure sign-in via Google Sign-In (`openid`, `email`, `profile`).
- **Google Docs API:** To authorize and retrieve content from the Google Docs document URL that you explicitly choose to import (`documents.readonly`).
- **Hugging Face API** to provide the AI-powered features that you choose to use.

Google user data accessed by pagenorma is strictly used to provide user-facing features (account sign-in, text analysis, and interlinear text preview). We do not use Google Workspace data to train, develop, or improve AI/ML models. Any text processed via external AI infrastructure (such as Hugging Face's inference APIs) is handled with zero data retention for model training.

We do not sell or rent your personal information or manuscript content.

## 5. Subscription and Account Information

pagenorma is temporarily offered free of charge without functional limitations. We reserve the right to introduce tiered service plans. Core functionality will remain accessible under a free tier, while enhanced features may require an active pagenorma QS subscription.

## 6. Changes to This Privacy Policy

We may update this Privacy Policy to reflect changes to pagenorma, our service providers, or applicable legal requirements. We will post the updated policy on this page and revise the “Last updated” date.