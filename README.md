![Petsciishop](docs/img/petsciishop_logo.png)

# Petsciishop

> The best-in-class, fully web-based, open source C64 PETSCII graphics editor. No install needed — runs entirely in your browser.

Petsciishop is our attempt to take the best ideas from across the C64 community, combine them with original research and new features, and package it all into a single accessible tool that anyone can use — no setup, no downloads, just open a URL and create.

### Highlights
- 🖼️ **TruSkii3000 image-to-PETSCII engine** — original research into perceptual color matching and character optimization
- 🌐 **100% web-based** — nothing to install, no platform restrictions, just open the URL and go
- 🔓 **Open source** — the ultimate PETSCII editor, built for everyone

**Try it now:** [https://rcoenen.github.io/Petsciishop/](https://rcoenen.github.io/Petsciishop/)

## The Story of TruSkii3000

TruSkii3000 grew out of a pretty direct obsession: how good can a PETSCII image converter actually get if you keep pushing it instead of stopping at "retro enough"?

The engine is our attempt to build a world-class PETSCII generator. It works inside the real limits of the Commodore 64: a fixed character grid, a tiny palette, strict VIC-II mode rules, shared colors, and constant tradeoffs between shape, contrast, texture, and color identity. The whole point is to squeeze the strongest possible image through those limits without losing what makes PETSCII look and feel right.

Over time, that turned TruSkii3000 into a meeting point between old machine constraints and modern image science. It pulls together C64 screen behavior, PETSCII character analysis, perceptual color theory, luminance structure, saliency, screen-wide refinement, and a lot of hard-nosed search. The current engine runs its hot path in a WASM-first core so the quality work is not trapped behind slow browser-side experimentation.

If you want the deeper technical write-up, start with [TRUSKI3000 Engine](docs/TRUSKI3000_Engine.md).

If you want to see it in action, browse the [TruSkii3000 Samples](https://rcoenen.github.io/Petsciishop/demo/truski3000-samples/) page for side-by-side `Original / STD / ECM / MCM` outputs with recorded timings.

## Features

- **Runs in the browser** — no Electron, no server, just open the URL and start creating
- **TruSkii3000 quality-first image-to-PETSCII engine** — perceptual color matching, saliency-weighted and screen-level character optimization, multiple C64 palettes. Supports Standard, ECM, and MCM modes with live previews
- **Inspector tool** — hover over any cell to read its character and color; click to pick it up as your active drawing settings
- **Per-screen palette support** — 9 industry-standard C64 palettes (Colodore, Pepto PAL/NTSC, VICE, and more), assignable per screen
- **ECM (Extended Color Mode)** — full support with 2×2 background grid in the character picker
- **Multiple file formats** — import and export support for the formats found across the C64 community's most-used tools, so your work is never locked in
- **SDD as the native format** — rather than inventing yet another file format, we standardized on the [SDD (Screen Designer Data)](https://www.c64-wiki.com/wiki/Screen_Designer_(CBM_prg_Studio)) format: open, XML-based, extensible, and already supported across the C64 toolchain
- **Multi-screen workspace** — work on multiple screens, export individually or together
- **CRT display filters** — scanlines, color TV, and B&W TV effects
- **Drag & drop** — drop `.petsciishop` files directly into the editor

## Standing on the shoulders of giants

Petsciishop would not exist without the incredible work of the C64 community and those who came before:

- **[Petmate](https://github.com/nurpax/petmate)** by Janne Hellsten — the original foundation this project was built on
- **[PETSCII Editor](https://petscii.krissz.hu/)** by Krissz — a great web-based PETSCII editor that inspired many of our features
- **[c64-image-to-petscii](https://github.com/mkeke/c64-image-to-petscii)** by mkeke — the image converter algorithm we built upon
- **[CBM prg Studio](https://www.ajordison.co.uk/)** by Arthur Jordison — creator of the SDD file format we use for interoperability
- **[Colodore](http://www.pepto.de/projects/colorvic/)** palette by Philip "Pepto" Timmermann — we support all major C64 palettes found across emulators and tools, but Colodore is the gold standard and our default: the most accurate, mathematically derived C64 color reference available
- The entire **Commodore 64 demoscene and PETSCII art community** — for keeping this art form alive and thriving for over 40 years

## Contributing

Ideas, feedback, and showcase of your work are welcome in [GitHub Discussions](https://github.com/rcoenen/Petsciishop/discussions). Bug reports and PRs go to [Issues](https://github.com/rcoenen/Petsciishop/issues).
