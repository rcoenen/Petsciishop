import type {
  ConverterCharset,
  ConverterFontBits,
  ConverterSettings,
  ConversionResult,
} from './imageConverter';
import {
  buildAlignmentOffsets,
  ConversionCancelledError,
} from './imageConverterStandardCore';
import type {
  AlignmentOffset,
  ProgressCallback,
  StandardPreprocessedImage,
  StandardSolvedModeCandidate,
} from './imageConverterStandardCore';
import type {
  StandardWorkerRequestMessage,
  StandardWorkerResponseMessage,
} from './imageConverterWorkerProtocol';

type ComboJob = {
  comboId: number;
  charset: ConverterCharset;
  offset: AlignmentOffset;
};

type WorkerSlot = {
  worker: Worker;
  busy: boolean;
  currentRequestId: number | null;
  currentComboId: number | null;
};

type ActiveRequest = {
  requestId: number;
  queue: ComboJob[];
  inflight: number;
  completed: number;
  total: number;
  best?: StandardSolvedModeCandidate;
  cancelled: boolean;
  cancelTimer: ReturnType<typeof setInterval> | null;
  onProgress: ProgressCallback;
  resolve: (result: StandardSolvedModeCandidate | undefined) => void;
  reject: (error: unknown) => void;
};

function buildComboJobs(): ComboJob[] {
  const jobs: ComboJob[] = [];
  let comboId = 0;
  for (const offset of buildAlignmentOffsets()) {
    jobs.push({ comboId: comboId++, charset: 'upper', offset });
    jobs.push({ comboId: comboId++, charset: 'lower', offset });
  }
  return jobs;
}

class StandardWorkerPool {
  private readonly slots: WorkerSlot[];
  private readonly ready: Promise<void>;
  private nextRequestId = 1;
  private activeRequest: ActiveRequest | null = null;

  constructor(fontBitsByCharset: ConverterFontBits) {
    const hardware = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const workerCount = Math.max(1, Math.min(8, Math.max(1, hardware - 1)));
    this.slots = Array.from({ length: workerCount }, () => ({
      worker: new Worker(new URL('./imageConverterWorker.ts', import.meta.url), { type: 'module' }),
      busy: false,
      currentRequestId: null,
      currentComboId: null,
    }));

    this.ready = Promise.all(this.slots.map(slot => new Promise<void>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<StandardWorkerResponseMessage>) => {
        if (event.data.type === 'ready') {
          slot.worker.removeEventListener('message', handleMessage);
          slot.worker.removeEventListener('error', handleError);
          resolve();
        }
      };
      const handleError = (event: ErrorEvent) => {
        slot.worker.removeEventListener('message', handleMessage);
        slot.worker.removeEventListener('error', handleError);
        reject(event.error ?? new Error(event.message));
      };
      slot.worker.addEventListener('message', handleMessage);
      slot.worker.addEventListener('error', handleError, { once: true });
      slot.worker.postMessage({
        type: 'init',
        fontBitsByCharset,
      } satisfies StandardWorkerRequestMessage);
    }))).then(() => {
      this.slots.forEach(slot => {
        slot.worker.onmessage = event => this.handleWorkerMessage(slot, event.data as StandardWorkerResponseMessage);
        slot.worker.onerror = event => this.handleWorkerError(slot, event);
      });
    });
  }

  async run(
    preprocessed: StandardPreprocessedImage,
    settings: ConverterSettings,
    onProgress: ProgressCallback,
    shouldCancel?: () => boolean
  ): Promise<StandardSolvedModeCandidate | undefined> {
    await this.ready;

    if (this.activeRequest) {
      this.cancelActiveRequest();
      throw new Error('Standard worker pool already has an active request.');
    }

    const requestId = this.nextRequestId++;
    const queue = buildComboJobs();
    const active: ActiveRequest = {
      requestId,
      queue,
      inflight: 0,
      completed: 0,
      total: queue.length,
      cancelled: false,
      cancelTimer: null,
      onProgress,
      resolve: () => {},
      reject: () => {},
    };
    this.activeRequest = active;

    this.slots.forEach(slot => {
      slot.worker.postMessage({
        type: 'start-request',
        requestId,
        preprocessed,
        settings,
      } satisfies StandardWorkerRequestMessage);
    });

    return await new Promise<StandardSolvedModeCandidate | undefined>((resolve, reject) => {
      active.resolve = resolve;
      active.reject = reject;
      active.cancelTimer = shouldCancel ? setInterval(() => {
        if (!active.cancelled && shouldCancel()) {
          this.cancelActiveRequest();
        }
      }, 25) : null;
      this.fillIdleWorkers();
    });
  }

  dispose() {
    this.cancelActiveRequest(true);
    this.slots.forEach(slot => slot.worker.terminate());
  }

  private fillIdleWorkers() {
    const active = this.activeRequest;
    if (!active || active.cancelled) return;

    for (const slot of this.slots) {
      if (slot.busy) continue;
      const job = active.queue.shift();
      if (!job) break;
      slot.busy = true;
      slot.currentRequestId = active.requestId;
      slot.currentComboId = job.comboId;
      active.inflight++;
      slot.worker.postMessage({
        type: 'solve-standard-combo',
        requestId: active.requestId,
        comboId: job.comboId,
        charset: job.charset,
        offset: job.offset,
      } satisfies StandardWorkerRequestMessage);
    }
  }

  private handleWorkerMessage(slot: WorkerSlot, message: StandardWorkerResponseMessage) {
    const active = this.activeRequest;
    if (!active) return;
    if ('requestId' in message && message.requestId !== undefined && message.requestId !== active.requestId) {
      return;
    }

    if (message.type === 'combo-result') {
      this.releaseSlot(slot);
      active.completed += 1;
      active.inflight -= 1;
      const solved: StandardSolvedModeCandidate = {
        conversion: message.conversion,
        error: message.error,
      };
      if (!active.best || solved.error < active.best.error) {
        active.best = solved;
      }
      active.onProgress(
        'Alignment',
        `STANDARD ${active.completed} of ${active.total}`,
        Math.round((active.completed / Math.max(1, active.total)) * 100)
      );
      this.fillIdleWorkers();
      this.maybeFinish();
      return;
    }

    if (message.type === 'cancelled') {
      if (slot.currentRequestId === active.requestId) {
        this.releaseSlot(slot);
        if (active.inflight > 0) {
          active.inflight -= 1;
        }
      }
      this.maybeFinish();
      return;
    }

    if (message.type === 'error') {
      this.releaseSlot(slot);
      if (active.inflight > 0) {
        active.inflight -= 1;
      }
      this.failActiveRequest(new Error(message.error));
    }
  }

  private handleWorkerError(slot: WorkerSlot, event: ErrorEvent) {
    this.releaseSlot(slot);
    this.failActiveRequest(event.error ?? new Error(event.message));
  }

  private maybeFinish() {
    const active = this.activeRequest;
    if (!active) return;
    if (active.cancelled) {
      if (active.inflight === 0) {
        this.finishActiveRequestWithError(new ConversionCancelledError());
      }
      return;
    }
    if (active.completed === active.total && active.inflight === 0) {
      const result = active.best;
      this.cleanupRequestData(active.requestId);
      this.clearActiveRequest();
      active.resolve(result);
    }
  }

  private cancelActiveRequest(fromDispose = false) {
    const active = this.activeRequest;
    if (!active || active.cancelled) return;
    active.cancelled = true;
    this.slots.forEach(slot => {
      slot.worker.postMessage({
        type: 'cancel',
        requestId: active.requestId,
      } satisfies StandardWorkerRequestMessage);
      if (fromDispose && slot.currentRequestId === active.requestId) {
        this.releaseSlot(slot);
      }
    });
    if (fromDispose) {
      this.finishActiveRequestWithError(new ConversionCancelledError());
    }
  }

  private failActiveRequest(error: Error) {
    this.cancelActiveRequest();
    this.finishActiveRequestWithError(error);
  }

  private finishActiveRequestWithError(error: Error) {
    const active = this.activeRequest;
    if (!active) return;
    this.clearActiveRequest();
    active.reject(error);
  }

  private clearActiveRequest() {
    const active = this.activeRequest;
    if (!active) return;
    if (active.cancelTimer) {
      clearInterval(active.cancelTimer);
    }
    this.activeRequest = null;
  }

  private cleanupRequestData(requestId: number) {
    this.slots.forEach(slot => {
      slot.worker.postMessage({
        type: 'cancel',
        requestId,
      } satisfies StandardWorkerRequestMessage);
    });
  }

  private releaseSlot(slot: WorkerSlot) {
    slot.busy = false;
    slot.currentRequestId = null;
    slot.currentComboId = null;
  }
}

let poolPromise: Promise<StandardWorkerPool> | null = null;

function supportsWorkerAcceleration(): boolean {
  return typeof Worker !== 'undefined';
}

async function getPool(fontBitsByCharset: ConverterFontBits): Promise<StandardWorkerPool> {
  if (!poolPromise) {
    poolPromise = Promise.resolve(new StandardWorkerPool(fontBitsByCharset));
  }
  return await poolPromise;
}

export async function runStandardConversionInWorkers(
  preprocessed: StandardPreprocessedImage,
  settings: ConverterSettings,
  fontBitsByCharset: ConverterFontBits,
  onProgress: ProgressCallback,
  shouldCancel?: () => boolean
): Promise<StandardSolvedModeCandidate | undefined> {
  if (!supportsWorkerAcceleration()) {
    throw new Error('Standard worker acceleration is not supported.');
  }
  const pool = await getPool(fontBitsByCharset);
  return await pool.run(preprocessed, settings, onProgress, shouldCancel);
}

export function disposeStandardConverterWorkers() {
  if (!poolPromise) return;
  void poolPromise.then(pool => pool.dispose()).catch(() => {});
  poolPromise = null;
}
