export class CaptureModeError extends Error {
  readonly operation: string;
  readonly mode: string;

  constructor(operation: string, mode: string, expected: string) {
    super(`${operation} needs ${expected}; the capture mode is ${mode}`);
    this.name = 'CaptureModeError';
    this.operation = operation;
    this.mode = mode;
  }
}

export class CaptureSourceGoneError extends Error {
  readonly sourceId: string;

  constructor(sourceId: string) {
    super(`the capture source ${sourceId} is not on this desktop any more`);
    this.name = 'CaptureSourceGoneError';
    this.sourceId = sourceId;
  }
}

export class CaptureEmptyError extends Error {
  readonly sourceId: string;

  constructor(sourceId: string) {
    super(`the capture source ${sourceId} gave no picture; the window may be minimised or hidden`);
    this.name = 'CaptureEmptyError';
    this.sourceId = sourceId;
  }
}

export class CaptureTooLargeError extends Error {
  readonly sourceId: string;
  readonly limit: number;

  constructor(sourceId: string, limit: number) {
    super(`the still of ${sourceId} stays above ${String(limit)} bytes at the lowest quality`);
    this.name = 'CaptureTooLargeError';
    this.sourceId = sourceId;
    this.limit = limit;
  }
}

export class CapturePickerCancelledError extends Error {
  constructor() {
    super('the system screen picker returned no source');
    this.name = 'CapturePickerCancelledError';
  }
}

export class CaptureChoiceError extends Error {
  readonly reason: 'missing' | 'stale';

  constructor(reason: 'missing' | 'stale') {
    super(
      reason === 'missing'
        ? 'a screen capture started without a source chosen through chooseCaptureSource'
        : 'the source chosen through chooseCaptureSource was not used in time',
    );
    this.name = 'CaptureChoiceError';
    this.reason = reason;
  }
}

export class ScreenAccessError extends Error {
  readonly status: string;

  constructor(status: string) {
    super(
      `the system blocks screen capture for this app (${status}); allow it in the system settings`,
    );
    this.name = 'ScreenAccessError';
    this.status = status;
  }
}
