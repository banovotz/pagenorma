---
layout: support-article
title: Supported file formats
description: Which source and translation files pagenorma can read, including scanned PDFs read with OCR.
category: Projects & Dashboard
category_slug: projects
permalink: /support/projects/supported-file-formats/
nav_order: 2
tags: [ePub, PDF, OCR, docx, rtf, odt, txt, formats]
applies_to: [pagenorma S, pagenorma QS]
last_modified_at: '2026-10-20'
related: [/support/projects/create-a-project/, /support/connections/use-a-document-file/]
---

## Source text (the original book)

| Format | Notes |
|---|---|
| **ePub** | Text, title and cover are read from the file. |
| **PDF** | Pages with selectable text are read directly. |
| **Scanned PDF** | Pages with little or no selectable text are read with OCR (text recognition). |

### OCR in more detail

While a scanned PDF is processed, the status line shows *OCR processing page 3/120…* and so on. OCR takes longer than reading ePub files, so allow time for a long book. It recognises text in these languages: English, Croatian, Serbian, Slovenian, Bosnian, German, French, Spanish, Italian, Portuguese, Dutch, Danish, Swedish, Norwegian, Finnish, Icelandic, Polish, Czech, Slovak, Hungarian, Romanian, Catalan, Basque, Galician and Turkish.

The first page of a PDF is used as the project cover.

## Translation

| Source | Notes |
|---|---|
| **Google Doc** | Chosen with the Google picker. Only Google Docs files are shown. |
| **DOCX, RTF, ODT, TXT** | Chosen as a file from your computer. |

Other formats are not supported. If you choose one, pagenorma tells you the supported formats are DOCX, RTF, ODT and TXT.

## Tips

- Source files usually include front matter such as copyright pages that you do not translate. The side-by-side view can [hide untranslated front matter]({% link support/analysis/read-the-side-by-side-view.md %}).
- If a file is rejected as invalid, re-save it from the program you made it in and try again.
