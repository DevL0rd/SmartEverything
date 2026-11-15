import type { Fixtures } from './fixtures.ts';
import type { LocalTarget } from './local-targets.ts';

export const SCALES: Readonly<Record<string, readonly string[]>> = {
  full: [],
  local: [
    '-seq-mib',
    '256',
    '-rand-mib',
    '64',
    '-rand-ops',
    '4096',
    '-files',
    '2000',
    '-create-files',
    '600',
    '-office-mib',
    '4',
    '-saves',
    '10',
  ],
  small: [
    '-seq-mib',
    '64',
    '-rand-mib',
    '16',
    '-rand-ops',
    '2048',
    '-files',
    '400',
    '-office-mib',
    '2',
    '-saves',
    '3',
  ],
};

export interface LocalConfig {
  readonly kinds: readonly string[];
  readonly runs: number;
  readonly workloads: readonly string[] | null;
  readonly scale: string;
  readonly stamp: string;
}

export interface Session {
  readonly config: LocalConfig;
  readonly fixtures: Fixtures | null;
  readonly results: string;
  readonly failures: string;
  readonly loads: string;
  readonly profiles: string;
}

export interface Probed extends LocalTarget {
  before?(): Promise<void>;
  after?(label: string): Promise<void>;
  diagnose?(label: string): Promise<void>;
  recover?(): Promise<void>;
}
