import type {
  ConverterAccelerationPath,
  ConverterFontBits,
  ConverterSettings,
  PreprocessedFittedImage,
  ProgressCallback,
  WorkerSolvedModeCandidate,
} from './imageConverter';
import { buildAlignmentOffsets, ConversionCancelledError } from './imageConverterStandardCore';
import type { AlignmentOffset } from './imageConverterStandardCore';
import type {
  ConverterWorkerRequestMessage,
  ConverterWorkerResponseMessage,
  WorkerMode,
} from './imageConverterWorkerProtocol';
import { shareModePreprocessedImage } from './imageConverterSharedPreprocessed';

type SupportedMode = Exclude<WorkerMode, 'standard'>;

type OffsetJob = {
  offsetId: number;
  offset: AlignmentOffset;
};

type BestModeOffset = {
  workerId: number;
  offsetId: number;
  offset: AlignmentOffset;
  error: number;
};

type WorkerSlot = {
  id: number;
  worker: Worker;
  busy: boolean;
  currentRequestId: number | null;
  currentOffsetId: number | null;
  currentOffset: AlignmentOffset | null;
  currentProgressPct: number;
};

type ActiveRequest = {
  requestId: number;
  mode: SupportedMode;
  queue: OffsetJob[];
  inflight: number;
  completed: number;
  total: number;
  best?: BestModeOffset;
  cancelled: boolean;
  finalizing: boolean;
  cancelTimer: ReturnType<typeof setInterval> | null;
  startedAt: number;
  onProgress: ProgressCallback;
  onModeBackend?: (backend: ConverterAccelerationPath) => void;
  resolve: (result: WorkerSolvedModeCandidate | undefined) => void;
  reject: (error: unknown) => void;
};

type WorkerReadyStatus = {
  workerId: number;
  wasmByMode: Record<WorkerMode, boolean>;
  wasmErrors?: Partial<Record<WorkerMode, string>>;
};

type WorkerAccelerationMode = 'auto' | 'js' | 'wasm';

let workerAccelerationMode: WorkerAccelerationMode = 'auto';

export function setModeWorkerAccelerationMode(mode: WorkerAccelerationMode) {
  if (workerAccelerationMode === mode) {
    return;
  }
  workerAccelerationMode = mode;
  disposeModeConverterWorkers();
}

function buildOffsetJobs(): OffsetJob[] {
  return buildAlignmentOffsets().map((offset, offsetId) => ({ offsetId, offset }));
}

class ModeWorkerPool {
  private readonly slots: WorkerSlot[];
  private readonly ready: Promise<void>;
  private readonly supportedMode: SupportedMode;
  private backendByMode: Record<SupportedMode, ConverterAccelerationPath> = {
    ecm: 'js',
    mcm: 'js',
  };
  private nextRequestId = 1;
  private activeRequest: ActiveRequest | null = null;

  constructor(fontBitsByCharset: ConverterFontBits, supportedMode: SupportedMode) {
    this.supportedMode = supportedMode;
    const hardware = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const workerCount = Math.max(1, Math.min(8, Math.max(1, hardware - 1)));
    this.slots = Array.from({ length: workerCount }, (_, index) => ({
      id: index + 1,
      worker: new Worker(new URL('./imageConverterWorker.ts', import.meta.url), { type: 'module' }),
      busy: false,
      currentRequestId: null,
      currentOffsetId: null,
      currentOffset: null,
      currentProgressPct: 0,
    }));

    this.ready = Promise.all(this.slots.map(slot => new Promise<WorkerReadyStatus>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<ConverterWorkerResponseMessage>) => {
        if (event.data.type === 'ready') {
          slot.worker.removeEventListener('message', handleMessage);
          slot.worker.removeEventListener('error', handleError);
          resolve({
            workerId: slot.id,
            wasmByMode: event.data.wasmByMode,
            wasmErrors: event.data.wasmErrors,
          });
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
        enabledModes: [supportedMode],
        disableWasm: workerAccelerationMode === 'js',
      } satisfies ConverterWorkerRequestMessage);
    }))).then(workerStatuses => {
      const allWorkersSupportWasm = workerStatuses.every(status => status.wasmByMode[supportedMode]);
      this.backendByMode = {
        ecm: supportedMode === 'ecm'
          ? workerAccelerationMode === 'js'
            ? 'js'
            : allWorkersSupportWasm ? 'wasm' : 'js'
          : 'js',
        mcm: supportedMode === 'mcm'
          ? workerAccelerationMode === 'js'
            ? 'js'
            : allWorkersSupportWasm ? 'wasm' : 'js'
          : 'js',
      };
      if (this.backendByMode[supportedMode] === 'wasm') {
        console.info(`[TruSkii3000] ${supportedMode.toUpperCase()} worker pool ready with WASM in all workers.`, {
          workerCount: workerStatuses.length,
          requestedMode: workerAccelerationMode,
          workers: workerStatuses.map(status => ({
            workerId: status.workerId,
            backend: 'wasm',
          })),
        });
      } else {
        console.info(`[TruSkii3000] ${supportedMode.toUpperCase()} worker pool using JS path.`, {
          workerCount: workerStatuses.length,
          requestedMode: workerAccelerationMode,
          workers: workerStatuses.map(status => ({
            workerId: status.workerId,
            backend: status.wasmByMode[supportedMode] ? 'wasm' : 'js',
            wasmError: status.wasmErrors?.[supportedMode],
          })),
        });
      }
      this.slots.forEach(slot => {
        slot.worker.onmessage = event => this.handleWorkerMessage(slot, event.data as ConverterWorkerResponseMessage);
        slot.worker.onerror = event => this.handleWorkerError(slot, event);
      });
    });
  }

  async run(
    mode: SupportedMode,
    preprocessed: PreprocessedFittedImage,
    settings: ConverterSettings,
    onProgress: ProgressCallback,
    onModeBackend?: (backend: ConverterAccelerationPath) => void,
    shouldCancel?: () => boolean
  ): Promise<WorkerSolvedModeCandidate | undefined> {
    await this.ready;
    if (mode !== this.supportedMode) {
      throw new Error(`Worker pool configured for ${this.supportedMode.toUpperCase()}, not ${mode.toUpperCase()}.`);
    }

    if (this.activeRequest) {
      this.cancelActiveRequest();
      throw new Error('Mode worker pool already has an active request.');
    }

    const requestId = this.nextRequestId++;
    const queue = buildOffsetJobs();
    const active: ActiveRequest = {
      requestId,
      mode,
      queue,
      inflight: 0,
      completed: 0,
      total: queue.length,
      cancelled: false,
      finalizing: false,
      cancelTimer: null,
      startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      onProgress,
      onModeBackend,
      resolve: () => {},
      reject: () => {},
    };
    this.activeRequest = active;
    onModeBackend?.(this.backendByMode[mode]);
    const sharedPreprocessed = shareModePreprocessedImage(preprocessed);

    this.slots.forEach(slot => {
      slot.worker.postMessage({
        type: 'start-request',
        requestId,
        preprocessed: sharedPreprocessed,
        settings,
      } satisfies ConverterWorkerRequestMessage);
    });

    return await new Promise<WorkerSolvedModeCandidate | undefined>((resolve, reject) => {
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
      slot.currentOffsetId = job.offsetId;
      slot.currentOffset = job.offset;
      slot.currentProgressPct = 0;
      active.inflight++;
      slot.worker.postMessage({
        type: 'solve-offset',
        requestId: active.requestId,
        mode: active.mode,
        offsetId: job.offsetId,
        offset: job.offset,
      } satisfies ConverterWorkerRequestMessage);
    }
  }

  private handleWorkerMessage(slot: WorkerSlot, message: ConverterWorkerResponseMessage) {
    const active = this.activeRequest;
    if (!active) return;
    if ('requestId' in message && message.requestId !== undefined && message.requestId !== active.requestId) {
      return;
    }

    if (message.type === 'mode-offset-score') {
      if (message.mode !== active.mode) {
        this.failActiveRequest(new Error(`Worker mode mismatch: expected ${active.mode}, got ${message.mode}`));
        return;
      }
      this.releaseSlot(slot);
      active.completed += 1;
      active.inflight -= 1;
      const solved: BestModeOffset = {
        workerId: slot.id,
        offsetId: message.offsetId,
        error: message.error,
        offset: slot.currentOffset ?? { x: 0, y: 0 },
      };
      if (!active.best || solved.error < active.best.error) {
        active.best = solved;
      }
      active.onProgress(
        'Alignment',
        `${active.mode.toUpperCase()} ${active.completed} of ${active.total}`,
        Number(((active.completed / Math.max(1, active.total)) * 100).toFixed(1))
      );
      this.fillIdleWorkers();
      this.maybeFinish();
      return;
    }

    if (message.type === 'mode-final-result') {
      if (message.mode !== active.mode) {
        this.failActiveRequest(new Error(`Worker mode mismatch: expected ${active.mode}, got ${message.mode}`));
        return;
      }
      const best = active.best;
      if (!best) {
        this.failActiveRequest(new Error(`Missing ${active.mode.toUpperCase()} best worker result.`));
        return;
      }
      if (message.offsetId !== best.offsetId) {
        this.failActiveRequest(
          new Error(`Worker finalized offset ${message.offsetId}, expected ${best.offsetId} for ${active.mode.toUpperCase()}.`)
        );
        return;
      }
      this.releaseSlot(slot);
      const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - active.startedAt;
      console.info(`[TruSkii3000] ${active.mode.toUpperCase()} conversion finished.`, {
        backend: this.backendByMode[active.mode],
        alignments: active.total,
        elapsedMs: Math.round(elapsedMs),
        elapsedSeconds: Number((elapsedMs / 1000).toFixed(2)),
      });
      this.cleanupRequestData(active.requestId);
      this.clearActiveRequest();
      active.resolve({
        conversion: message.conversion,
        error: message.error,
        offset: best.offset,
      });
      return;
    }

    if (message.type === 'progress') {
      if (message.mode !== active.mode) {
        return;
      }
      if (slot.currentOffsetId !== message.offsetId) {
        return;
      }
      slot.currentProgressPct = Math.max(0, Math.min(100, Number(message.pct)));
      active.onProgress(
        message.stage,
        this.formatProgressDetail(active, slot, message.offsetId, message.detail),
        this.computeOverallPct(active)
      );
      return;
    }

    if (message.type === 'cancelled') {
      if (slot.currentRequestId === active.requestId) {
        this.releaseSlot(slot);
        if (active.inflight > 0) active.inflight -= 1;
      }
      this.maybeFinish();
      return;
    }

    if (message.type === 'error') {
      this.releaseSlot(slot);
      if (active.inflight > 0) active.inflight -= 1;
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
      if (!active.best) {
        this.cleanupRequestData(active.requestId);
        this.clearActiveRequest();
        active.resolve(undefined);
        return;
      }
      if (active.finalizing) {
        return;
      }
      const slot = this.slots.find(workerSlot => workerSlot.id === active.best!.workerId);
      if (!slot) {
        this.failActiveRequest(new Error(`Missing worker ${active.best.workerId} for ${active.mode.toUpperCase()} finalization.`));
        return;
      }
      active.finalizing = true;
      slot.busy = true;
      slot.currentRequestId = active.requestId;
      slot.currentOffsetId = active.best.offsetId;
      slot.currentOffset = active.best.offset;
      slot.currentProgressPct = 100;
      slot.worker.postMessage({
        type: 'finalize-mode-offset',
        requestId: active.requestId,
        mode: active.mode,
        offsetId: active.best.offsetId,
      } satisfies ConverterWorkerRequestMessage);
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
      } satisfies ConverterWorkerRequestMessage);
      if ((fromDispose || active.finalizing) && slot.currentRequestId === active.requestId) {
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
      } satisfies ConverterWorkerRequestMessage);
    });
  }

  private releaseSlot(slot: WorkerSlot) {
    slot.busy = false;
    slot.currentRequestId = null;
    slot.currentOffsetId = null;
    slot.currentOffset = null;
    slot.currentProgressPct = 0;
  }

  private computeOverallPct(active: ActiveRequest): number {
    const inFlightPct = this.slots.reduce((sum, slot) => {
      if (slot.currentRequestId !== active.requestId) {
        return sum;
      }
      return sum + slot.currentProgressPct;
    }, 0);
    return Number((((active.completed * 100) + inFlightPct) / Math.max(1, active.total)).toFixed(1));
  }

  private formatProgressDetail(
    active: ActiveRequest,
    slot: WorkerSlot,
    offsetId: number,
    detail: string
  ): string {
    const offsetLabel = slot.currentOffset
      ? `offset ${offsetId + 1}/${active.total} (${slot.currentOffset.x},${slot.currentOffset.y})`
      : `offset ${offsetId + 1}/${active.total}`;
    return detail ? `${active.mode.toUpperCase()} ${offsetLabel} - ${detail}` : `${active.mode.toUpperCase()} ${offsetLabel}`;
  }
}

const poolPromises: Partial<Record<SupportedMode, Promise<ModeWorkerPool>>> = {};

function supportsWorkerAcceleration(): boolean {
  return typeof Worker !== 'undefined';
}

async function getPool(mode: SupportedMode, fontBitsByCharset: ConverterFontBits): Promise<ModeWorkerPool> {
  if (!poolPromises[mode]) {
    poolPromises[mode] = Promise.resolve(new ModeWorkerPool(fontBitsByCharset, mode));
  }
  return await poolPromises[mode]!;
}

export async function runModeConversionInWorkers(
  mode: SupportedMode,
  preprocessed: PreprocessedFittedImage,
  settings: ConverterSettings,
  fontBitsByCharset: ConverterFontBits,
  onProgress: ProgressCallback,
  onModeBackend?: (backend: ConverterAccelerationPath) => void,
  shouldCancel?: () => boolean
): Promise<WorkerSolvedModeCandidate | undefined> {
  if (!supportsWorkerAcceleration()) {
    throw new Error(`${mode.toUpperCase()} worker acceleration is not supported.`);
  }
  const pool = await getPool(mode, fontBitsByCharset);
  return await pool.run(mode, preprocessed, settings, onProgress, onModeBackend, shouldCancel);
}

export function disposeModeConverterWorkers() {
  (Object.keys(poolPromises) as SupportedMode[]).forEach(mode => {
    const poolPromise = poolPromises[mode];
    if (!poolPromise) {
      return;
    }
    void poolPromise.then(pool => pool.dispose()).catch(() => {});
    delete poolPromises[mode];
  });
}
