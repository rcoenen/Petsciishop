import {
  buildCharsetConversionContext as buildModeCharsetConversionContext,
  buildPaletteColorsById as buildModePaletteColorsById,
  buildPaletteMetricData as buildModePaletteMetricData,
  type CompactModeWorkerConversion,
  type ConverterCharset,
  type ProgressCallback as ModeProgressCallback,
  solveModeOffsetWorker,
} from './imageConverter';
import type {
  BinaryCandidateScoringKernel,
  CharsetConversionContext as ModeCharsetConversionContext,
  McmCandidateScoringKernel,
  PaletteMetricData as ModePaletteMetricData,
  PreprocessedFittedImage,
} from './imageConverter';
import {
  buildCharsetConversionContext,
  buildPaletteColorsById,
  buildPaletteMetricData,
  ConversionCancelledError,
  solveStandardOffset,
} from './imageConverterStandardCore';
import type {
  CharsetConversionContext,
  PaletteMetricData,
  ProgressCallback as StandardProgressCallback,
  StandardCandidateScoringKernel,
} from './imageConverterStandardCore';
import { BinaryWasmKernel, type StandardWasmRequestSession } from './imageConverterBinaryWasm';
import { McmWasmKernel } from './imageConverterMcmWasm';
import type {
  ConverterWorkerProgressMessage,
  ConverterWorkerRequestMessage,
  ConverterWorkerResponseMessage,
  ModeWorkerProgressCheckpoint,
  ConverterWorkerModeFinalResultMessage,
  ConverterWorkerModeOffsetScoreMessage,
} from './imageConverterWorkerProtocol';

type StoredModeSolveResult = NonNullable<Awaited<ReturnType<typeof solveModeOffsetWorker>>>;

type WorkerState = {
  standardContexts: Record<ConverterCharset, CharsetConversionContext> | null;
  modeContexts: Record<ConverterCharset, ModeCharsetConversionContext> | null;
  enabledModes: Set<'standard' | 'ecm' | 'mcm'>;
  activeRequests: Set<number>;
  requestData: Map<number, {
    preprocessed: Parameters<typeof solveStandardOffset>[0];
    settings: Parameters<typeof solveStandardOffset>[1];
    standardWasmSession?: StandardWasmRequestSession;
    bestModeResult?: {
      offsetId: number;
      candidate: StoredModeSolveResult;
    };
  }>;
  standardPaletteCache: Map<string, PaletteMetricData>;
  modePaletteCache: Map<string, ModePaletteMetricData>;
  scoringKernel: StandardCandidateScoringKernel | null;
  modeBinaryScoringKernel: BinaryCandidateScoringKernel | null;
  mcmScoringKernel: McmCandidateScoringKernel | null;
};

const state: WorkerState = {
  standardContexts: null,
  modeContexts: null,
  enabledModes: new Set(['standard', 'ecm', 'mcm']),
  activeRequests: new Set(),
  requestData: new Map(),
  standardPaletteCache: new Map(),
  modePaletteCache: new Map(),
  scoringKernel: null,
  modeBinaryScoringKernel: null,
  mcmScoringKernel: null,
};

function post(message: ConverterWorkerResponseMessage, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

function splitModeProgressDetail(detail: string): {
  charset?: ConverterCharset;
  detail: string;
} {
  if (detail.startsWith('UPPER')) {
    return {
      charset: 'upper',
      detail: detail.startsWith('UPPER - ') ? detail.slice('UPPER - '.length) : '',
    };
  }
  if (detail.startsWith('LOWER')) {
    return {
      charset: 'lower',
      detail: detail.startsWith('LOWER - ') ? detail.slice('LOWER - '.length) : '',
    };
  }
  return { detail };
}

function buildModeProgressCheckpoint(
  mode: 'ecm' | 'mcm',
  stage: string,
  detail: string
): ModeWorkerProgressCheckpoint | undefined {
  const parsed = splitModeProgressDetail(detail);

  if (mode === 'ecm' && stage === 'Converting') {
    const backgroundsMatch = parsed.detail.match(/^ECM backgrounds ([0-9,]+) \((\d+)\/(\d+)\)$/);
    if (backgroundsMatch) {
      return {
        kind: 'ecm-backgrounds',
        charset: parsed.charset,
        current: Number(backgroundsMatch[2]),
        total: Number(backgroundsMatch[3]),
      };
    }

    const resolveMatch = parsed.detail.match(/^ECM register re-solve \((\d+)\/(\d+)\)$/);
    if (resolveMatch) {
      return {
        kind: 'ecm-register-resolve',
        charset: parsed.charset,
        current: Number(resolveMatch[1]),
        total: Number(resolveMatch[2]),
      };
    }
  }

  if (mode === 'mcm') {
    if (stage === 'MCM globals') {
      return {
        kind: 'mcm-globals',
        charset: parsed.charset,
      };
    }

    if (stage === 'Converting') {
      const comboMatch = parsed.detail.match(/^MCM bg=(\d+), mc1=(\d+), mc2=(\d+) \((\d+)\/(\d+)\)$/);
      if (comboMatch) {
        return {
          kind: 'mcm-combo',
          charset: parsed.charset,
          bg: Number(comboMatch[1]),
          mc1: Number(comboMatch[2]),
          mc2: Number(comboMatch[3]),
          current: Number(comboMatch[4]),
          total: Number(comboMatch[5]),
        };
      }
    }
  }

  return undefined;
}

function getModeResultTransfers(conversion: CompactModeWorkerConversion): Transferable[] {
  return [
    conversion.screencodes.buffer,
    conversion.colors.buffer,
    conversion.ecmBgColors.buffer,
    conversion.bgIndices.buffer,
    conversion.mcmSharedColors.buffer,
  ];
}

function toCompactModeWorkerConversion(candidate: StoredModeSolveResult): CompactModeWorkerConversion {
  return {
    screencodes: Uint8Array.from(candidate.result.screencodes),
    colors: Uint8Array.from(candidate.result.colors),
    backgroundColor: candidate.conversion.backgroundColor,
    ecmBgColors: Uint8Array.from(candidate.conversion.ecmBgColors),
    bgIndices: Uint8Array.from(candidate.conversion.bgIndices),
    mcmSharedColors: Uint8Array.from(candidate.conversion.mcmSharedColors),
    charset: candidate.conversion.charset,
    mode: candidate.conversion.mode as 'ecm' | 'mcm',
    accelerationBackend: candidate.conversion.accelerationBackend,
  };
}

function getStandardMetrics(paletteId: string) {
  const cached = state.standardPaletteCache.get(paletteId);
  if (cached) return cached;
  const metrics = buildPaletteMetricData(buildPaletteColorsById(paletteId));
  state.standardPaletteCache.set(paletteId, metrics);
  return metrics;
}

function getModeMetrics(paletteId: string) {
  const cached = state.modePaletteCache.get(paletteId);
  if (cached) return cached;
  const metrics = buildModePaletteMetricData(buildModePaletteColorsById(paletteId));
  state.modePaletteCache.set(paletteId, metrics);
  return metrics;
}

self.onmessage = async (event: MessageEvent<ConverterWorkerRequestMessage>) => {
  const message = event.data;

  try {
    if (message.type === 'init') {
      const enabledModes = new Set(message.enabledModes ?? ['standard', 'ecm', 'mcm']);
      const needsStandard = enabledModes.has('standard');
      const needsBinaryMode = enabledModes.has('ecm') || enabledModes.has('mcm');
      const needsMcm = enabledModes.has('mcm');
      state.enabledModes = enabledModes;
      state.standardContexts = needsStandard
        ? {
            upper: buildCharsetConversionContext(message.fontBitsByCharset.upper),
            lower: buildCharsetConversionContext(message.fontBitsByCharset.lower),
          }
        : null;
      state.modeContexts = needsBinaryMode
        ? {
            upper: buildModeCharsetConversionContext(message.fontBitsByCharset.upper, needsMcm),
            lower: buildModeCharsetConversionContext(message.fontBitsByCharset.lower, needsMcm),
          }
        : null;
      const standardWasm = message.disableWasm || (!needsStandard && !needsBinaryMode)
        ? { kernel: null, error: message.disableWasm ? 'WASM disabled by caller.' : undefined }
        : await BinaryWasmKernel.create();
      const mcmWasm = message.disableWasm || !needsMcm
        ? { kernel: null, error: message.disableWasm ? 'WASM disabled by caller.' : undefined }
        : await McmWasmKernel.create();
      state.scoringKernel = standardWasm.kernel;
      state.modeBinaryScoringKernel = standardWasm.kernel;
      state.mcmScoringKernel = mcmWasm.kernel;
      if (needsStandard && standardWasm.kernel) {
        console.info('[TruSkii3000] Standard/ECM worker initialized with WASM kernel.');
      } else if (needsStandard || enabledModes.has('ecm')) {
        console.warn('[TruSkii3000] Standard/ECM worker falling back to JavaScript scoring.', standardWasm.error);
      }
      if (needsMcm && mcmWasm.kernel) {
        console.info('[TruSkii3000] MCM worker initialized with WASM kernel.');
      } else if (needsMcm) {
        console.warn('[TruSkii3000] MCM worker falling back to JavaScript scoring.', mcmWasm.error);
      }
      post({
        type: 'ready',
        wasmByMode: {
          standard: needsStandard && Boolean(standardWasm.kernel),
          ecm: needsBinaryMode && Boolean(standardWasm.kernel),
          mcm: needsMcm && Boolean(mcmWasm.kernel),
        },
        wasmErrors: {
          standard: needsStandard ? standardWasm.error : undefined,
          ecm: needsBinaryMode ? standardWasm.error : undefined,
          mcm: needsMcm ? mcmWasm.error : undefined,
        },
      });
      return;
    }

    if (message.type === 'start-request') {
      let standardWasmSession: StandardWasmRequestSession | undefined;
      if (state.scoringKernel instanceof BinaryWasmKernel) {
        const metrics = getStandardMetrics(message.settings.paletteId);
        if (state.enabledModes.has('standard')) {
          standardWasmSession = state.scoringKernel.beginStandardRequest(message.preprocessed, metrics.pairDiff);
        } else {
          state.scoringKernel.preloadStandardState(message.preprocessed, metrics.pairDiff);
        }
      }
      if (state.mcmScoringKernel instanceof McmWasmKernel) {
        state.mcmScoringKernel.preloadPairDiff(getModeMetrics(message.settings.paletteId).pairDiff);
      }
      state.requestData.set(message.requestId, {
        preprocessed: message.preprocessed,
        settings: message.settings,
        standardWasmSession,
      });
      state.activeRequests.add(message.requestId);
      return;
    }

    if (message.type === 'cancel') {
      state.activeRequests.delete(message.requestId);
      state.requestData.delete(message.requestId);
      post({ type: 'cancelled', requestId: message.requestId });
      return;
    }

    if (message.type === 'solve-offset') {
      if (!state.enabledModes.has(message.mode)) {
        throw new Error(`Worker does not support mode ${message.mode}`);
      }
      const request = state.requestData.get(message.requestId);
      if (!request) {
        throw new Error(`Unknown worker request ${message.requestId}`);
      }
      const shouldCancel = () => !state.activeRequests.has(message.requestId);
      const postProgress = ((stage: string, detail: string, pct: number) => {
        if (!state.activeRequests.has(message.requestId)) {
          return;
        }
        const progressMessage: ConverterWorkerProgressMessage = {
          type: 'progress',
          requestId: message.requestId,
          mode: message.mode,
          offsetId: message.offsetId,
          stage,
          detail,
          pct,
          checkpoint: message.mode === 'standard'
            ? undefined
            : buildModeProgressCheckpoint(message.mode, stage, detail),
        };
        post(progressMessage);
      }) as StandardProgressCallback & ModeProgressCallback;
      const result = message.mode === 'standard'
        ? await solveStandardOffset(
            request.preprocessed,
            request.settings,
            (() => {
              if (!state.standardContexts) {
                throw new Error('Worker not initialized for Standard mode');
              }
              return state.standardContexts;
            })(),
            getStandardMetrics(request.settings.paletteId),
            message.offset,
            request.standardWasmSession?.scoringKernel ?? state.scoringKernel ?? undefined,
            shouldCancel,
            postProgress
          )
        : await solveModeOffsetWorker(
            message.mode,
            request.preprocessed as PreprocessedFittedImage,
            request.settings,
            (() => {
              if (!state.modeContexts) {
                throw new Error(`Worker not initialized for ${message.mode.toUpperCase()} mode`);
              }
              return state.modeContexts;
            })(),
            getModeMetrics(request.settings.paletteId),
            message.offset,
            state.modeBinaryScoringKernel ?? undefined,
            state.mcmScoringKernel ?? undefined,
            postProgress,
            shouldCancel
          );
      if (!state.activeRequests.has(message.requestId)) {
        post({ type: 'cancelled', requestId: message.requestId, offsetId: message.offsetId });
        return;
      }
      if (!result) {
        post({ type: 'cancelled', requestId: message.requestId, offsetId: message.offsetId });
        return;
      }
      if (message.mode === 'standard') {
        post({
          type: 'offset-result',
          requestId: message.requestId,
          mode: 'standard',
          offsetId: message.offsetId,
          conversion: result.conversion,
          error: result.error,
        });
        return;
      }

      const modeResult = result as StoredModeSolveResult;
      if (!request.bestModeResult || modeResult.error < request.bestModeResult.candidate.error) {
        request.bestModeResult = {
          offsetId: message.offsetId,
          candidate: modeResult,
        };
      }
      const scoreMessage: ConverterWorkerModeOffsetScoreMessage = {
        type: 'mode-offset-score',
        requestId: message.requestId,
        mode: message.mode,
        offsetId: message.offsetId,
        error: modeResult.error,
      };
      post(scoreMessage);
      return;
    }

    if (message.type === 'finalize-mode-offset') {
      const request = state.requestData.get(message.requestId);
      if (!request) {
        throw new Error(`Unknown worker request ${message.requestId}`);
      }
      if (!state.activeRequests.has(message.requestId)) {
        post({ type: 'cancelled', requestId: message.requestId, offsetId: message.offsetId });
        return;
      }
      const best = request.bestModeResult;
      if (!best) {
        throw new Error(`No stored ${message.mode.toUpperCase()} worker result for request ${message.requestId}`);
      }
      if (best.offsetId !== message.offsetId) {
        throw new Error(
          `Stored ${message.mode.toUpperCase()} worker result mismatch: expected offset ${message.offsetId}, got ${best.offsetId}`
        );
      }
      if (best.candidate.conversion.mode !== message.mode) {
        throw new Error(
          `Stored worker result mode mismatch: expected ${message.mode}, got ${best.candidate.conversion.mode}`
        );
      }
      const conversion = toCompactModeWorkerConversion(best.candidate);
      const finalMessage: ConverterWorkerModeFinalResultMessage = {
        type: 'mode-final-result',
        requestId: message.requestId,
        mode: message.mode,
        offsetId: message.offsetId,
        conversion,
        error: best.candidate.error,
      };
      post(finalMessage, getModeResultTransfers(conversion));
      return;
    }
  } catch (error: any) {
    if (error instanceof ConversionCancelledError) {
      if ('requestId' in message) {
        post({
          type: 'cancelled',
          requestId: message.requestId,
          offsetId: 'offsetId' in message ? message.offsetId : undefined,
        });
      }
      return;
    }
    post({
      type: 'error',
      requestId: 'requestId' in message ? message.requestId : undefined,
      offsetId: 'offsetId' in message ? message.offsetId : undefined,
      error: error?.message ?? String(error),
    });
  }
};
