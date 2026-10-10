import {
  IrCodeError,
  learnedCode,
  type IrCode,
  type IrScheme,
  type ReportedValue,
} from '@smarteverything/tuya';

export interface LearnWait {
  readonly result: Promise<IrCode>;
  readonly cancel: () => void;
}

export class IrLearnTimeoutError extends Error {
  override readonly name = 'IrLearnTimeoutError';

  constructor(
    readonly deviceId: string,
    readonly timeoutMs: number,
  ) {
    super(
      `IR blaster ${deviceId} reported no learned code within ${String(timeoutMs / 1000)} seconds.`,
    );
  }
}

class IrLearnCancelledError extends Error {
  override readonly name = 'IrLearnCancelledError';

  constructor(readonly deviceId: string) {
    super(`Learning on IR blaster ${deviceId} stopped because the Tuya provider stopped.`);
  }
}

interface Waiting {
  readonly deviceId: string;
  readonly scheme: IrScheme;
  readonly settle: (outcome: IrCode | Error) => void;
}

export class Learners {
  private readonly waiting = new Set<Waiting>();

  wait(deviceId: string, scheme: IrScheme, timeoutMs: number): LearnWait {
    let settleWith: (outcome: IrCode | Error) => void = () => undefined;
    const result = new Promise<IrCode>((resolve, reject) => {
      settleWith = (outcome): void => {
        if (outcome instanceof Error) {
          reject(outcome);
        } else {
          resolve(outcome);
        }
      };
    });
    const timer = setTimeout(() => {
      entry.settle(new IrLearnTimeoutError(deviceId, timeoutMs));
    }, timeoutMs);
    const finish = (): void => {
      clearTimeout(timer);
      this.waiting.delete(entry);
    };
    const entry: Waiting = {
      deviceId,
      scheme,
      settle: (outcome) => {
        finish();
        settleWith(outcome);
      },
    };
    this.waiting.add(entry);
    return { result, cancel: finish };
  }

  offer(deviceId: string, report: readonly ReportedValue[]): void {
    for (const entry of [...this.waiting].filter((candidate) => candidate.deviceId === deviceId)) {
      this.offerTo(entry, report);
    }
  }

  cancelAll(): void {
    for (const entry of [...this.waiting]) {
      entry.settle(new IrLearnCancelledError(entry.deviceId));
    }
  }

  private offerTo(entry: Waiting, report: readonly ReportedValue[]): void {
    for (const item of report) {
      try {
        const code = learnedCode(entry.scheme, item.code, item.value);
        if (code !== null) {
          entry.settle(code);
          return;
        }
      } catch (error) {
        if (!(error instanceof IrCodeError)) {
          throw error;
        }
        entry.settle(error);
        return;
      }
    }
  }
}
