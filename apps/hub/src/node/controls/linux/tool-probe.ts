import type { RunProgram } from '../../run-program';

const MISSING_RETRY_MS = 60_000;

interface Verdict {
  readonly available: boolean;
  readonly checkedAt: number;
}

export class ToolProbe {
  private readonly verdicts = new Map<string, Verdict>();

  constructor(
    private readonly run: RunProgram,
    private readonly now: () => number = Date.now,
  ) {}

  async available(file: string, args: readonly string[]): Promise<boolean> {
    const key = [file, ...args].join(' ');
    const known = this.verdicts.get(key);
    if (
      known !== undefined &&
      (known.available || this.now() - known.checkedAt < MISSING_RETRY_MS)
    ) {
      return known.available;
    }
    const available = await this.run(file, args).then(
      () => true,
      () => false,
    );
    this.verdicts.set(key, { available, checkedAt: this.now() });
    return available;
  }
}
