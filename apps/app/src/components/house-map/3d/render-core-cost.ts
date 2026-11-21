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

const rendererPins = new WeakMap<readonly CompiledProgram[], ProgramPins>();

export function pinsOf(info: ProgramInfo): ProgramPins | null {
  const { programs } = info;
  if (programs === null) return null;
  const known = rendererPins.get(programs);
  if (known !== undefined) return known;
  const made = new ProgramPins();
  rendererPins.set(programs, made);
  return made;
}

export class FrameCost {
  private sized = false;

  resized(): void {
    this.sized = true;
  }

  measure(info: ProgramInfo, draw: () => void): number | null {
    const started = performance.now();
    draw();
    const elapsed = performance.now() - started;
    const compiled = pinsOf(info)?.keep(info) === true;
    const sized = this.sized;
    this.sized = false;
    return sized || compiled ? null : elapsed;
  }
}
