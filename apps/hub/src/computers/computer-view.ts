import {
  SAMPLE_TOPICS,
  completeProcessRow,
  processKey,
  type ComputerParts,
  type ComputerPartName,
  type ComputerPartsUpdate,
  type ComputerScope,
  type ComputerScopes,
  type ProcessRow,
  type ProcessesPart,
  type ProcessesUpdate,
} from '@smarteverything/domain';

const PART_SCOPES: Readonly<Record<ComputerPartName, ComputerScope | null>> = {
  summary: 'metrics',
  cpu: 'metrics',
  gpu: 'metrics',
  memory: 'metrics',
  disks: 'metrics',
  network: 'metrics',
  sensors: 'metrics',
  power: 'metrics',
  processes: 'processes',
  audio: 'system',
  displays: 'system',
  system: 'system',
  services: 'system',
  windows: 'apps',
  tiling: 'apps',
  session: null,
};

const RETAINED: ReadonlySet<string> = new Set(['summary']);

const PART_NAMES: readonly ComputerPartName[] = Object.keys(PART_SCOPES).filter(isPartName);

function isPartName(name: string): name is ComputerPartName {
  return name in PART_SCOPES;
}

export function pickParts<Parts extends ComputerPartsUpdate>(
  parts: Parts,
  keep: (name: ComputerPartName) => boolean,
): Parts {
  const picked: Parts = { ...parts };
  for (const name of PART_NAMES) {
    if (!keep(name)) Reflect.deleteProperty(picked, name);
  }
  return picked;
}

export function visibleParts<Parts extends ComputerPartsUpdate>(
  parts: Parts,
  scopes: ComputerScopes,
): Parts {
  const allowed = pickParts(parts, (name) => {
    const scope = PART_SCOPES[name];
    return scope === null || scopes[scope];
  });
  const { session } = allowed;
  if (session === undefined || scopes.apps) return allowed;
  return { ...allowed, session: { ...session, focused: null } };
}

export class MergedParts {
  private parts: ComputerParts = {};
  private at: string | null = null;
  private readonly rows = new Map<string, ProcessRow>();

  get latestAt(): string | null {
    return this.at;
  }

  get latest(): ComputerParts {
    return this.parts;
  }

  merge(at: string, incoming: ComputerPartsUpdate): void {
    this.at = at;
    const { processes, ...rest } = incoming;
    this.parts = {
      ...this.parts,
      ...rest,
      ...(processes === undefined ? {} : { processes: this.mergeProcesses(processes) }),
    };
  }

  retain(topics: ReadonlySet<string>): void {
    const sampled: ReadonlySet<string> = new Set(SAMPLE_TOPICS);
    this.parts = pickParts(
      this.parts,
      (name) => !sampled.has(name) || RETAINED.has(name) || topics.has(name),
    );
    if (this.parts.processes === undefined) this.rows.clear();
  }

  clear(): void {
    this.parts = {};
    this.at = null;
    this.rows.clear();
  }

  private mergeProcesses(part: ProcessesUpdate): ProcessesPart {
    for (const update of part.rows) {
      const key = processKey(update);
      const row = completeProcessRow(this.rows.get(key), update);
      if (row !== null) this.rows.set(key, row);
    }
    const visible = new Set(part.order);
    for (const key of this.rows.keys()) if (!visible.has(key)) this.rows.delete(key);
    return { ...part, rows: part.order.flatMap((key) => this.rows.get(key) ?? []) };
  }
}
