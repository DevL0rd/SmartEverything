export interface CompiledProgram {
  usedTimes: number;
}

export interface ProgramInfo {
  readonly programs: readonly CompiledProgram[] | null;
}

export function programCount(info: ProgramInfo): number {
  return info.programs?.length ?? 0;
}

export class ProgramPins {
  private readonly pinned = new WeakSet<CompiledProgram>();
  private seen = 0;

  keep(info: ProgramInfo): boolean {
    const count = programCount(info);
    if (count === this.seen) return false;
    this.seen = count;
    for (const program of info.programs ?? []) {
      if (this.pinned.has(program)) continue;
      this.pinned.add(program);
      program.usedTimes += 1;
    }
    return true;
  }
}

export class FrameCost {
  private sized = false;
  private readonly pins = new ProgramPins();

  resized(): void {
    this.sized = true;
  }

  measure(info: ProgramInfo, draw: () => void): number | null {
    const started = performance.now();
    draw();
    const elapsed = performance.now() - started;
    const compiled = this.pins.keep(info);
    const sized = this.sized;
    this.sized = false;
    return sized || compiled ? null : elapsed;
  }
}
