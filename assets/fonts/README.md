# Self-hosted fonts

Inter (v20) and Lora (v37) are served from this directory instead of
`fonts.googleapis.com` / `fonts.gstatic.com`, so the critical path is
HTML → font (preloaded) rather than HTML → font CSS → font files.

Both fonts are licensed under the SIL Open Font License 1.1; copies are in
[`OFL-Inter.txt`](OFL-Inter.txt) and [`OFL-Lora.txt`](OFL-Lora.txt).

| File | Contents | Bytes |
| --- | --- | ---: |
| `inter-latin.woff2` | Inter variable, Latin, weights 400–700 | 48,432 |
| `inter-extended.woff2` | Ć ć Č č Đ đ Š š Ž ž Ź ź Ś ś + combining marks | 4,624 |
| `lora-latin.woff2` | Lora variable, Latin, weights 400–700 | 37,792 |
| `lora-extended.woff2` | same extended glyphs as above | 3,740 |
| `lora-italic-latin.woff2` | Lora italic 400, Latin | 22,740 |
| `lora-italic-extended.woff2` | same extended glyphs, italic | 2,448 |

The `*-extended.woff2` files exist because the only Latin-extended characters
in the site copy are the Croatian diacritics in "Davor Banović" and similar
names. Their `unicode-range` keeps them off the critical path; the full
Latin-extended subsets from Google were 85 KiB + 20 KiB + 12 KiB for the same
handful of glyphs.

`@font-face` rules live at the top of `../css/style.css`. The preload hints in
`_includes/head.html` point at the two Latin files used above the fold; if a
filename changes, update those hints too.

## Regenerating

Request the CSS from the Google Fonts CSS2 API with a modern browser UA so it
returns WOFF2, then download the `/* latin */` URL. For example:

```sh
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
curl -A "$UA" 'https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap'
curl -A "$UA" 'https://fonts.googleapis.com/css2?family=Lora:wght@400..700&display=swap'
curl -A "$UA" 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@1,400&display=swap'
```

For the tiny extended subsets, add `&text=<URL-encoded characters>` to those
URLs (the characters above are `ĆćČčĐđŠšŽž`). If the site starts using other
Latin-extended characters, extend that `text=` list and regenerate, or switch
those faces to the full `/* latin-ext */` URLs from the first CSS response.
