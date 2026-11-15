# CJK Font Subset Preview (for Godot web / mobile builds)

Free tool that runs entirely in your browser: pick a Japanese / Chinese / Korean font (.ttf / .otf),
paste the text your game uses (or add text files such as .csv, .po, .tscn, .json), and see how small
the font gets when it keeps only those characters. You can download the subset font.

**Open the tool:** https://imaiibuki.github.io/cjk-font-subset-preview/

Your files never leave your browser (no upload, no analytics).

## Why

CJK fonts are large (in our tests: Noto Sans JP variable 9.6 MB, Zen Maru Gothic 3.8 MB, M PLUS 1p 1.8 MB).
Godot packs the font into the exported project, so it directly adds to the web (.pck / download) size
and mobile builds. A subset keeps only the glyphs your text needs.

Measured with this tool (329 characters: ASCII + all kana + a short Japanese sample):

| Font | Original | Subset |
|---|---|---|
| Noto Sans JP (variable) | 9,589,900 B | 213,576 B |
| M PLUS 1p | 1,758,688 B | 54,272 B |
| Zen Maru Gothic | 3,832,756 B | 68,760 B |

## Cautions

- Only subset fonts whose license allows it (e.g. SIL OFL). OFL fonts with Reserved Font Names may need renaming.
- Text added later (player names, new translations, user input) must be included, or it shows as missing glyphs.
- Variable-font axes and layout tables (kerning, vertical forms) are kept. `.ttc` collections are not supported.

## Run locally

Serve the folder over HTTP (WebAssembly does not load from `file://`), e.g. `python -m http.server`, then open `index.html`.

## Credits and license

- Uses HarfBuzz hb-subset via [harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs) (MIT; HarfBuzz is "Old MIT") — see `vendor/`.
- This tool's code and this README were written with the help of AI (Claude).
- Code of this page: MIT.
