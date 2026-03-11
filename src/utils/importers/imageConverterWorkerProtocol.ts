import type {
  CompactModeWorkerConversion,
  ConverterFontBits,
  ConverterSettings,
  ConversionResult,
  ConverterCharset,
} from './imageConverter';
import type { AlignmentOffset, StandardPreprocessedImage } from './imageConverterStandardCore';
import type { PreprocessedFittedImage } from './imageConverter';

export type WorkerMode = 'standard' | 'ecm' | 'mcm';
export type ModeWorkerProgressCheckpointKind =
  | 'ecm-backgrounds'
  | 'ecm-register-resolve'
  | 'mcm-globals'
  | 'mcm-combo';

export interface ModeWorkerProgressCheckpoint {
  kind: ModeWorkerProgressCheckpointKind;
  charset?: ConverterCharset;
  current?: number;
  total?: number;
  bg?: number;
  mc1?: number;
  mc2?: number;
}

export interface ConverterWorkerInitMessage {
  type: 'init';
  fontBitsByCharset: ConverterFontBits;
  enabledModes?: WorkerMode[];
  disableWasm?: boolean;
}

export interface ConverterWorkerStartRequestMessage {
  type: 'start-request';
  requestId: number;
  preprocessed: StandardPreprocessedImage | PreprocessedFittedImage;
  settings: ConverterSettings;
}

export interface ConverterWorkerSolveOffsetMessage {
  type: 'solve-offset';
  requestId: number;
  mode: WorkerMode;
  offsetId: number;
  offset: AlignmentOffset;
}

export interface ConverterWorkerFinalizeModeOffsetMessage {
  type: 'finalize-mode-offset';
  requestId: number;
  mode: Exclude<WorkerMode, 'standard'>;
  offsetId: number;
}

export interface ConverterWorkerCancelMessage {
  type: 'cancel';
  requestId: number;
}

export type ConverterWorkerRequestMessage =
  | ConverterWorkerInitMessage
  | ConverterWorkerStartRequestMessage
  | ConverterWorkerSolveOffsetMessage
  | ConverterWorkerFinalizeModeOffsetMessage
  | ConverterWorkerCancelMessage;

export interface ConverterWorkerReadyMessage {
  type: 'ready';
  wasmByMode: Record<WorkerMode, boolean>;
  wasmErrors?: Partial<Record<WorkerMode, string>>;
}

export interface ConverterWorkerOffsetResultMessage {
  type: 'offset-result';
  requestId: number;
  mode: 'standard';
  offsetId: number;
  conversion: ConversionResult;
  error: number;
}

export interface ConverterWorkerModeOffsetScoreMessage {
  type: 'mode-offset-score';
  requestId: number;
  mode: Exclude<WorkerMode, 'standard'>;
  offsetId: number;
  error: number;
}

export interface ConverterWorkerModeFinalResultMessage {
  type: 'mode-final-result';
  requestId: number;
  mode: Exclude<WorkerMode, 'standard'>;
  offsetId: number;
  conversion: CompactModeWorkerConversion;
  error: number;
}

export interface ConverterWorkerProgressMessage {
  type: 'progress';
  requestId: number;
  mode: WorkerMode;
  offsetId: number;
  stage: string;
  detail: string;
  pct: number;
  checkpoint?: ModeWorkerProgressCheckpoint;
}

export interface ConverterWorkerCancelledMessage {
  type: 'cancelled';
  requestId: number;
  offsetId?: number;
}

export interface ConverterWorkerErrorMessage {
  type: 'error';
  requestId?: number;
  offsetId?: number;
  error: string;
}

export type ConverterWorkerResponseMessage =
  | ConverterWorkerReadyMessage
  | ConverterWorkerModeOffsetScoreMessage
  | ConverterWorkerModeFinalResultMessage
  | ConverterWorkerProgressMessage
  | ConverterWorkerOffsetResultMessage
  | ConverterWorkerCancelledMessage
  | ConverterWorkerErrorMessage;
