# ECM Investigation Handoff

## Current Status

The ECM regression diagnosis is now much stronger than the original handoff.

The earlier hypothesis was:

- the ECM per-background precompute + finalist-pool merge optimization might be narrowing the candidate space and harming quality

Claude's follow-up analysis found a more precise cause:

- the optimization itself is conceptually fine
- the regression came from an **indexing bug** inside the ECM pool-merge step

This README reflects that updated understanding.

## Symptom Summary

On the same source image (`ninja-a`, preset `True Neutral`, palette `Colodore`):

- `Standard` remains good
- `MCM` remains broadly stable
- `ECM` regressed into typographic garbage like `M`, `P`, `?`, `4`, `7`

Observed timing also changed:

- older ECM run: about `1m 02s`
- newer ECM run: about `40s`

So ECM became faster while also becoming visually wrong.

## What We Ruled Out

### Not primarily a JS vs WASM parity problem

The UI backend switch was used to force both:

- `JS`
- `WASM`

The ECM result was effectively the same in both cases.

That strongly implies:

- the bug was in shared ECM solver logic
- not in a backend-specific numeric or parity issue

### Not adequately explained by "Text Glyphs enabled"

Allowing typographic glyphs can make ECM uglier, but it does **not** explain this regression by itself.

Why:

- earlier builds reportedly produced materially better ECM results even with glyphs allowed
- Standard and MCM also allow glyphs, but they did not collapse the same way

So glyph allowance may amplify the symptom, but it was not the root cause.

## Confirmed Root Cause

### `mergeBinaryCandidatePoolsByBackground(...)` used the wrong index

File:

- `/Users/rob/Dev/Petscii-shop/src/utils/importers/imageConverter.ts`

Function:

- `mergeBinaryCandidatePoolsByBackground(...)`

Buggy form:

```ts
const backgroundPool = candidatePoolsByBackground[bi][cellIndex];
```

Correct form:

```ts
const backgroundPool = candidatePoolsByBackground[backgrounds[bi]][cellIndex];
```

### Why this matters

`bi` is only the loop counter:

- `0`
- `1`
- `2`
- `3`

It is **not** the actual background color id.

So for a finalist set like:

```ts
[0, 6, 11, 14]
```

the buggy code would read pools for:

```ts
[0, 1, 2, 3]
```

instead of:

```ts
[0, 6, 11, 14]
```

That means ECM finalist sets were often being solved against the wrong per-background candidate pools.

## Why This Explains The Observed Behavior

### Garbage ECM output

If finalist sets are pulling the wrong pools, the solver is combining candidates that do not correspond to the intended background set. That can easily produce nonsensical local winners, including typographic-looking junk.

### JS === WASM

Both backends use the same ECM merge logic, so both would produce the same broken result.

### ECM-specific failure

- `Standard` does not use this ECM merge path
- `MCM` has its own separate path
- only ECM depends on this specific pool merge logic

### Register refinement also affected

`runEcmRegisterResolvePass(...)` reuses the same merge function, so refined ECM background sets were also being solved against the wrong pools.

## Important Correction To The Earlier Handoff

The original suspicion was:

- the precompute + merge optimization might itself be mathematically lossy

Claude's diagnosis says that was probably the wrong target.

The stronger conclusion is:

- precomputing pools by background color and merging later is acceptable in principle
- the real problem was looking up the wrong background pools during the merge

So this is best understood as:

- **implementation bug**
- not **architectural invalidity**

## Current Code State

As of this reread, the code in:

- `/Users/rob/Dev/Petscii-shop/src/utils/importers/imageConverter.ts`

already uses the corrected form:

```ts
const backgroundPool = candidatePoolsByBackground[backgrounds[bi]][cellIndex];
```

So if anyone is comparing screenshots or behavior, make sure they are not reasoning from a pre-fix run or stale dev build.

## Files Most Relevant To Inspect

### ECM solver core

- `/Users/rob/Dev/Petscii-shop/src/utils/importers/imageConverter.ts`

Focus on:

- `buildBinaryCandidatePoolsForCellByBackground(...)`
- `buildBinaryCandidatePoolsByBackground(...)`
- `mergeBinaryCandidatePoolsByBackground(...)`
- `solveEcmForCombo(...)`
- `runEcmRegisterResolvePass(...)`
- `refineEcmBackgroundSet(...)`

### Worker/backend plumbing

Only relevant for sanity-checking execution path selection:

- `/Users/rob/Dev/Petscii-shop/src/utils/importers/imageConverterWorker.ts`
- `/Users/rob/Dev/Petscii-shop/src/utils/importers/imageConverterModeWorkerPool.ts`
- `/Users/rob/Dev/Petscii-shop/src/utils/importers/imageConverterStandardWorkerPool.ts`

### UI/backend selection

- `/Users/rob/Dev/Petscii-shop/src/containers/ImageConverterModal.tsx`

The modal now has a backend switch that forces `JS` or `WASM`.

## Recommended Next Step

Do a fresh visual verification on the corrected ECM merge code:

- source: `ninja-a`
- preset: `True Neutral`
- palette: `Colodore`
- backend: both `JS` and `WASM`

What to check:

- does ECM stop collapsing into typographic garbage?
- do `JS` and `WASM` still match visually?

If ECM still looks wrong **after** confirming the corrected merge path is actually running, then the next suspects should be:

- ECM background-set ranking
- ECM register re-solve
- recent ECM scoring changes

But the first-order regression reported here is best explained by the fixed merge-index bug.

## Summary For Claude

The updated diagnosis is:

- ECM regression was real
- it reproduced in both `JS` and `WASM`
- the most likely root cause was an indexing bug in `mergeBinaryCandidatePoolsByBackground(...)`
- the pool-merging optimization itself is probably fine
- the code now appears to contain the corrected index lookup

The immediate question is no longer:

- "Is pool merging conceptually lossy?"

It is now:

- "After the merge-index fix, does ECM visual quality return to the expected pre-regression level?"
