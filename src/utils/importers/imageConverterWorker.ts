import type { ConverterCharset } from './imageConverter';
import {
  buildCharsetConversionContext,
  buildPaletteColorsById,
  buildPaletteMetricData,
  ConversionCancelledError,
  solveStandardCombo,
} from './imageConverterStandardCore';
import type { CharsetConversionContext } from './imageConverterStandardCore';
import type {
  StandardWorkerRequestMessage,
  StandardWorkerResponseMessage,
} from './imageConverterWorkerProtocol';

type WorkerState = {
  contexts: Record<ConverterCharset, CharsetConversionContext> | null;
  activeRequests: Set<number>;
  requestData: Map<number, {
    preprocessed: Parameters<typeof solveStandardCombo>[0];
    settings: Parameters<typeof solveStandardCombo>[1];
  }>;
  paletteCache: Map<string, ReturnType<typeof buildPaletteMetricData>>;
};

const state: WorkerState = {
  contexts: null,
  activeRequests: new Set(),
  requestData: new Map(),
  paletteCache: new Map(),
};

function post(message: StandardWorkerResponseMessage) {
  self.postMessage(message);
}

function getMetrics(paletteId: string) {
  const cached = state.paletteCache.get(paletteId);
  if (cached) return cached;
  const metrics = buildPaletteMetricData(buildPaletteColorsById(paletteId));
  state.paletteCache.set(paletteId, metrics);
  return metrics;
}

self.onmessage = async (event: MessageEvent<StandardWorkerRequestMessage>) => {
  const message = event.data;

  try {
    if (message.type === 'init') {
      state.contexts = {
        upper: buildCharsetConversionContext(message.fontBitsByCharset.upper),
        lower: buildCharsetConversionContext(message.fontBitsByCharset.lower),
      };
      post({ type: 'ready' });
      return;
    }

    if (message.type === 'start-request') {
      state.requestData.set(message.requestId, {
        preprocessed: message.preprocessed,
        settings: message.settings,
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

    if (message.type === 'solve-standard-combo') {
      if (!state.contexts) {
        throw new Error('Worker not initialized');
      }
      const request = state.requestData.get(message.requestId);
      if (!request) {
        throw new Error(`Unknown worker request ${message.requestId}`);
      }
      const result = await solveStandardCombo(
        request.preprocessed,
        request.settings,
        state.contexts[message.charset],
        getMetrics(request.settings.paletteId),
        message.charset,
        message.offset,
        undefined,
        () => !state.activeRequests.has(message.requestId)
      );
      if (!state.activeRequests.has(message.requestId)) {
        post({ type: 'cancelled', requestId: message.requestId, comboId: message.comboId });
        return;
      }
      post({
        type: 'combo-result',
        requestId: message.requestId,
        comboId: message.comboId,
        conversion: result.conversion,
        error: result.error,
      });
      return;
    }
  } catch (error: any) {
    if (error instanceof ConversionCancelledError) {
      if ('requestId' in message) {
        post({
          type: 'cancelled',
          requestId: message.requestId,
          comboId: 'comboId' in message ? message.comboId : undefined,
        });
      }
      return;
    }
    post({
      type: 'error',
      requestId: 'requestId' in message ? message.requestId : undefined,
      comboId: 'comboId' in message ? message.comboId : undefined,
      error: error?.message ?? String(error),
    });
  }
};
