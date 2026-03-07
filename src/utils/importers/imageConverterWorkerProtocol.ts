import type { ConverterCharset, ConverterFontBits, ConverterSettings, ConversionResult } from './imageConverter';
import type { AlignmentOffset, StandardPreprocessedImage } from './imageConverterStandardCore';

export interface StandardWorkerInitMessage {
  type: 'init';
  fontBitsByCharset: ConverterFontBits;
}

export interface StandardWorkerStartRequestMessage {
  type: 'start-request';
  requestId: number;
  preprocessed: StandardPreprocessedImage;
  settings: ConverterSettings;
}

export interface StandardWorkerSolveComboMessage {
  type: 'solve-standard-combo';
  requestId: number;
  comboId: number;
  charset: ConverterCharset;
  offset: AlignmentOffset;
}

export interface StandardWorkerCancelMessage {
  type: 'cancel';
  requestId: number;
}

export type StandardWorkerRequestMessage =
  | StandardWorkerInitMessage
  | StandardWorkerStartRequestMessage
  | StandardWorkerSolveComboMessage
  | StandardWorkerCancelMessage;

export interface StandardWorkerReadyMessage {
  type: 'ready';
}

export interface StandardWorkerComboResultMessage {
  type: 'combo-result';
  requestId: number;
  comboId: number;
  conversion: ConversionResult;
  error: number;
}

export interface StandardWorkerCancelledMessage {
  type: 'cancelled';
  requestId: number;
  comboId?: number;
}

export interface StandardWorkerErrorMessage {
  type: 'error';
  requestId?: number;
  comboId?: number;
  error: string;
}

export type StandardWorkerResponseMessage =
  | StandardWorkerReadyMessage
  | StandardWorkerComboResultMessage
  | StandardWorkerCancelledMessage
  | StandardWorkerErrorMessage;
