## Phase 1: Quick Wins
- [x] 1.1 Implement brightness debt accumulation — horizontal and vertical scanline scalars tracking luminance error between best match and source patch mean, nudging threshold for neighboring cells
- [x] 1.2 Implement color coherence post-pass — scan for cells with fg/bg not appearing in any neighbor, re-match constrained to neighbor palette, accept if error increase < threshold
- [x] 1.3 Add chroma preservation bonus to cell scoring — measure dominant hue via `atan2(b,a)` in OKLAB, bonus when chosen color pair preserves source patch hue
- [x] 1.4 Add typographic character exclusion — flag letters/digits/punctuation in atlas, skip during image matching by default, add `settings.includeTypographic` toggle
- [x] 1.5 Add color candidate pruning via distance LUT — skip (fg, bg) pairs where `pairDiff[fg*16+bg]` is below minimum-contrast threshold before scoring

## Phase 2: Atlas & Cell Statistics Foundation
- [x] 2.1 Compute per-cell Laplacian detail score — 3x3 Laplacian convolution on L channel, store in `Float32Array[1000]`
- [x] 2.2 Compute per-cell dominant gradient direction — Sobel Gx/Gy on L channel, quantize to 4 directional bins + isotropic, store per cell
- [x] 2.3 Build glyph atlas metadata — for each of 256 glyphs precompute: normalized coverage (`setCount/64`), spatial frequency (row/col transition count normalized to [0,1]), directionality (projection profile bias across H/V/diagonal), symmetry flags (H/V/rotational)
- [x] 2.4 Precompute glyph luminance profiles — per-glyph mean and variance of pixel coverage pattern for fast pre-filtering in the inner loop

## Phase 3: Perceptual Scoring Upgrades
- [x] 3.1 Implement CSF-weighted glyph scoring — multiply glyph spatial frequency by `(1 - detailScore)` for the cell; smooth cell + busy glyph = penalty. Expose `settings.csfWeight` with tunable strength
- [x] 3.2 Implement edge continuity post-pass — along cells with high detail score, check glyph directionality compatibility with cell gradient direction, re-score with directional alignment bonus, re-assign if coherence improves within error budget
- [x] 3.3 Add saliency weighting to palette solver — weight ECM background set ranking and MCM triple ranking by per-cell saliency, so high-saliency cells dominate register selection
- [x] 3.4 Implement ECM register re-solve post-pass — after initial solve, collect actual bg color assignments per cell, run k-means (k=4) weighted by cell error, reassign registers if shifted, re-match only affected cells. 1-2 iterations
- [x] 3.5 CODEX: Add coverage-aware Standard background selection — coarse-only coverage extremity penalty scaled by luminance distance between cell average and candidate background luminance

## Phase 4: Output & Measurement
- [x] 4.1 Implement OKLAB ΔE quality metric — render output back to OKLAB pixel data, compute per-cell and whole-image mean ΔE vs source, return in `ConversionResult.qualityMetric`
- [x] 4.1a CODEX: Add `cellSSIM` metric — average each 8×8 cell to one luminance value and evaluate SSIM over the resulting 40×25 cell grid with a 3×3 sliding window
- [x] 4.2 CODEX: Export per-cell metadata — expose `fgColor`, `bgColor`, `errorScore`, `detailScore`, and `saliencyWeight` per cell in `ConversionResult.cellMetadata`, plus an MCM cell-behavior flag (for example `mcmCellIsHires`) for MCM exports. Global mode lives at `ConversionResult.mode`
- [x] 4.3 CODEX: Add aspect-ratio-correct preview — present the preview at a 4:3 display aspect (for example via a 320x240 viewport or equivalent display-layer scaling) instead of showing raw 320x200 square pixels

## Phase 5: WASM Performance
- [x] 5.1 Implement XOR + popcount Hamming matching path in WASM — pack threshold map as u64 (Standard/ECM) or u32 (MCM), XOR against glyph bitmaps, popcount for Hamming distance. Profile against JS error-accumulation path, keep both
- [x] 5.2 Move 16x16 distance LUT to WASM linear memory — fixed offset in WASM memory, enable SIMD-width lookups without JS↔WASM boundary crossings. Host uploads `pairDiff` into resident kernel memory before scoring
- [ ] 5.3 Port remaining hot paths to WASM — candidate scoring, CSF weighting, brightness debt. Target i64x2 SIMD for Hamming path (2 glyphs per instruction, 128 iterations for full atlas)
- [ ] 5.4 Benchmark and validate — extend the existing benchmark/parity harness coverage until WASM-vs-JS validation is stable across all targeted modes and representative fixtures. Profile end-to-end conversion time vs JS baseline

## Phase 6: WASM-First Engine Migration
- [x] 6.1 Move the Standard full solver core into WASM
- [x] 6.1a Define resident Standard WASM memory layout — source planes, glyph metadata, pairDiff/LUT state, candidate buffers, screen buffers, refinement scratch space
- [x] 6.1b Add a Standard-focused WASM host API — init state, coarse background ranking, candidate pool construction, solve/refinement entrypoints, compact result/progress outputs
- [x] 6.1c Port Standard coarse background ranking to WASM
- [x] 6.1d Port Standard candidate-pool construction to WASM
- [x] 6.1e Port Standard screen solve passes and refinement to WASM
- [x] 6.1f Validate Standard parity + timing against the six-fixture accepted Standard baseline set before switching any default path
  - Current exact benchmark on the six Standard fixtures: `182676.9ms` JS-only vs `32707.4ms` WASM-only = **82.10% faster** overall (`5.59x`)
- [x] 6.2 Move the ECM and MCM full solver cores into WASM — ECM solve 85.8% faster (2.6x per combo), MCM solve 82.4% faster (1.3x per combo)
- [x] 6.3 Keep conversion state resident in WASM memory — mode workers now preload source planes/LUT state per request and upload ECM/MCM cell error tables once per offset so kernels read resident cell buffers by `cellIndex` instead of per-cell JS copies
- [ ] 6.4 Reduce JS to orchestration/UI responsibilities — progress events and compact result buffers come back from WASM while fallback JS solver paths are reduced over time
- [x] 6.4a Port ECM candidate-pool construction/finalization into the binary WASM host path — ECM compact pools/finalization now stay on the WASM-first path, and the targeted `doggy.png` ECM parity canary passed after removing the mode-path wildcard admission mismatch
- [x] 6.4b Port MCM coarse triple ranking + candidate-pool construction into WASM — legal hires-vs-multicolor cell evaluation now stays in the WASM-first search path, and the targeted `slayer_multi_color.png` MCM compare canary passed
- [x] 6.4c Bridge compact ECM/MCM progress checkpoints + result buffers through the worker boundary — mode workers now return transferable typed result buffers plus structured progress checkpoints, and the main thread assembles the final `ConversionResult`
- [ ] 6.4d Reduce JS fallback paths to explicit unavailable/debug paths and validate milestone canaries before any default-path change
  - CODEX update (2026-03-11): removed the old `auto` backend mode, made `js` the explicit reference path, and stopped silent `wasm -> js` worker downgrades in the normal conversion/harness flow. Stable canaries passed for ECM `ninja-a` (`js` and `wasm`) and MCM `slayer_multi_color` (`wasm`).
  - CODEX update (2026-03-11): the Image Converter modal now surfaces explicit `wasm` failures to the user and points them to the manual `js` fallback instead of failing only in the console.
  - CODEX update (2026-03-11): refreshed the accepted ECM baselines for `doggy` and `house-a` after targeted explicit `js` vs `wasm` parity passed on both fixtures. The broader explicit-backend milestone sweep remains a separate gate.

CODEX: Phase 6 execution policy:
- Use targeted canary validation while iterating on a slice, not the full fixture matrix.
- Standard canaries for ordinary 6.1 work: `doggy.png`, `ninja-a.png`, and `skeletor.png` when needed.
- Run full mode sweeps only at milestone gates (`6.1f`, the equivalent ECM/MCM parity gates, or before changing default backend behavior).
- Do not accept a speed win if accepted quality baselines move unexpectedly.
- ECM provenance note (2026-03-11): stored ECM baselines for `doggy` and `house-a` are stale artifacts. Current JS/WASM-parity-clean outputs are preferred. `doggy` improved in two historical waves: `16a8b33` / `daf9d14` recovered ECM candidate-pool quality, and `59bc36e` is the first commit that matches the current accepted `doggy` output exactly. Refresh those baselines deliberately rather than treating them as regressions from `6.4` work.

CODEX: Manual mode choice remains authoritative. Cross-mode ranking, recommendation, and automatic mode selection are out of scope for this change.
CODEX: Preserve and document legal per-cell hires-versus-multicolor behavior within the MCM path; do not regress or misclassify it as forbidden mixed-mode output.

## CODEX: Post-Review Closure
- [x] C1 CODEX: Normalize lower-is-better delta presentation in the comparison HTML so it matches the console's "positive = improvement" reporting
- [x] C2 CODEX: Sync non-OpenSpec status docs with the current implementation state, especially 4:3 preview, per-cell metadata export, and the competitive wildcard admission wording
- [x] C3 CODEX: Refresh and confirm the Standard-mode validation set after the current branch decisions are accepted, preserving the `doggy` improvement while keeping `ninja-a`, `skeletor`, `slayer_multi_color`, `house-a`, and `petsciishop_logo` unchanged
