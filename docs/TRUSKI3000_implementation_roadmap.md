# TRUSKI3000 Implementation Roadmap

Goal: 100% coverage of `docs/TRUSKI3000_Engine.md`.

Legal per-cell hires-versus-multicolor behavior within an MCM screen remains in scope throughout this roadmap. It is standard C64 behavior inside MCM, not forbidden cross-mode Standard/ECM/MCM mixing.

Effort: **XS** < 4h | **S** 1-2d | **M** 3-5d | **L** 1-2w | **XL** 2-4w

Last updated: 2026-03-10

---

## Phase 1 — Quick Wins ✅ COMPLETE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | **Brightness debt accumulation** | ✅ | `BRIGHTNESS_DEBT_WEIGHT=64.0`, decay=0.6, clamp=0.18. Scanline-level error propagation |
| 1.2 | **Color coherence post-pass** | ✅ | 3 passes, `COLOR_COHERENCE_MAX_DELTA=18.0`. Re-matches outlier cells to neighbor colors |
| 1.3 | **Chroma preservation bonus** | ⚠️ Implemented, disabled | `computeHuePreservationBonus()` exists but `CHROMA_BONUS_WEIGHT=0` — needs tuning |
| 1.4 | **Typographic character exclusion** | ✅ | `isTypographicScreencode()` + `settings.includeTypographic` toggle |
| 1.5 | **Candidate pruning via distance LUT** | ✅ | `hasMinimumContrast()` with `MIN_PAIR_DIFF_RATIO=0.16` |

---

## Phase 2 — Atlas & Cell Statistics Foundation ✅ COMPLETE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 2.1 | **Detail score (Laplacian)** | ✅ | `imageConverterCellMetrics.ts` — 8-neighbor Laplacian, normalized 0..1 |
| 2.2 | **Dominant gradient direction** | ✅ | Sobel Gx/Gy → 5 bins (isotropic, H, V, diag-R, diag-L) |
| 2.3 | **Glyph atlas tagging** | ✅ | `glyphAtlas.ts` — coverage, spatialFrequency, dominantDirection, symmetry (H/V/rotational) |
| 2.4 | **Glyph luminance profiles** | ✅ | `luminanceMean` and `luminanceVariance` Float32Arrays |

---

## Phase 3 — Perceptual Scoring Upgrades ✅ MOSTLY COMPLETE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 3.1 | **CSF-weighted glyph scoring** | ✅ | `computeCsfPenalty()` — high-freq glyph in smooth cell = penalty. Unified with blend bonus via `BLEND_CSF_RELIEF=1.5` |
| 3.2 | **Edge continuity post-pass** | ✅ | 3 passes, `EDGE_CONTINUITY_MAX_DELTA=12.0`. Directional alignment bonus (`EDGE_ALIGNMENT_WEIGHT=14.0`) |
| 3.3 | **Saliency weighting in palette solve** | ❌ Missing | Saliency used per-pixel during matching, not during ECM/MCM register selection |
| 3.4 | **ECM register re-solve** | ❌ Missing | No k-means on actual assignments |

**Beyond original roadmap (added during tuning):**

| Feature | Status | Notes |
|---------|--------|-------|
| **Coverage extremity penalty** | ✅ | Coarse scorer penalizes extreme coverage × lumDistance. Steers mid-tone images to PETSCII-friendly backgrounds while protecting dark images. `COVERAGE_EXTREMITY_WEIGHT=20.0` |
| **Standalone blend match bonus** | ✅ | `BLEND_MATCH_WEIGHT=3.0` — rewards fg/bg pairs whose blend matches source color |
| **Wildcard candidate admission** | ✅ | Low-contrast candidates enter pool when within score margin (0.15) or blend quality > 0.7 |
| **Repeat penalty** | ✅ | `REPEAT_PENALTY=28.0` — screen-level character diversity, scaled by self-tile similarity |
| **Selective low-contrast handling** | ✅ | Standard keeps the normal contrast-pruned pool and admits a capped number of competitive low-contrast wildcard candidates during pool construction |

---

## Phase 4 — Output & Measurement ✅ COMPLETE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 4.1 | **OKLAB ΔE quality metric** | ✅ | `imageConverterQualityMetrics.ts` — full suite: lumaRMSE, chromaRMSE, meanDeltaE, per-tile SSIM, p95DeltaE |
| 4.1+ | **cellSSIM metric** | ✅ | Cell-averaged SSIM at 40×25 grid with 3×3 sliding window — captures "looks right from viewing distance" |
| 4.1+ | **Test harness** | ✅ | `scripts/truski3000-harness/run.mjs` — 5 commands (compare, record, benchmark, parity, validate), visual comparison HTML, character utilization diagnostics, color pair gap analysis |
| 4.2 | **Per-cell metadata export** | ✅ | `ConversionResult.cellMetadata` now includes per-cell colors, error, detail, saliency, and MCM cell-behavior metadata |
| 4.3 | **Aspect-ratio-correct preview** | ✅ | Converter previews are displayed at a 4:3 presentation aspect in the UI |

---

## Phase 5 — WASM Performance ⚠️ PARTIAL

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 5.1 | **XOR + popcount Hamming path** | ⚠️ Implemented, disabled | `computeBinaryHammingDistancesJs()` in `imageConverterBitPacking.ts`. Disabled because set-error-matrix produces better quality (`ENABLE_EXPERIMENTAL_HAMMING_FAST_PATH=false`) |
| 5.2 | **Distance LUT in WASM linear memory** | ❌ Missing | `pairDiff` remains in JS Float64Array |
| 5.3 | **Full WASM kernel buildout** | ⚠️ Partial | Only `computeSetErrs` ported to WASM (f32x4 SIMD). Currently **slower than JS** — needs profiling. Auto-detection falls back to JS when WASM is slower |

**Status: WASM is not blocking quality work. JS path is fast enough for interactive use. WASM optimization is pure performance polish.**

---

## Phase 6 — Global Legal Mode Selection ❌ NOT STARTED

The capstone: choosing and explaining the best single legal full-screen mode.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 6.1 | **Global legal mode selection** | ❌ Missing | Score Standard/ECM/MCM, auto-select best full-screen mode |
| 6.2 | **Per-mode ranking + comparison output** | ❌ Missing | Expose total error per mode for UI explanation |
| 6.3 | **Advanced saliency** | ❌ Missing | Edge energy + center bias beyond deviation-from-mean |

---

## Summary

| Phase | Status | What Changed |
|-------|--------|--------------|
| 1. Quick Wins | ✅ Complete | Brightness debt, color coherence, typographic exclusion, contrast pruning |
| 2. Foundation | ✅ Complete | Detail scores, gradient directions, full glyph atlas |
| 3. Perceptual Scoring | ✅ ~90% | CSF, edge continuity, blend bonus, coverage extremity, wildcards. Missing: saliency in palette solve, ECM re-solve |
| 4. Output & Measurement | ✅ Complete | Full quality metrics suite + cellSSIM + test harness + per-cell metadata export + 4:3 preview |
| 5. WASM Performance | ⚠️ ~20% | Hamming path + WASM kernel exist but disabled/slower than JS |
| 6. Global Mode Selection | ❌ 0% | Auto-select best mode, ranking output, advanced saliency |

**Current engine state: ~90% of spec implemented with all major perceptual features active. Quality tuning is ongoing. Remaining work is mode selection (Phase 6), WASM performance (Phase 5), and ECM/MCM quality polish.**
