import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sleep } from '../processes.ts';
import { seTarget } from './helper.ts';
import {
  dropSegment,
  harvest,
  hubProbe,
  keepSegment,
  probeRoot,
  type LocalHub,
} from './local-hub.ts';
import type { Probed, Session } from './local-types.ts';
import { bench } from './paths.ts';

export interface SeVariant {
  readonly kind: string;
  readonly maxBackground: number | null;
  readonly parallel: boolean;
}

export interface SeInput {
  readonly hub: LocalHub;
  readonly binary: string;
  readonly session: Session;
  readonly variant: SeVariant;
}

const HUB_FILES = ['.json', '.cpuprofile'];
const HELPER_FILES = ['.json'];

class State {
  helperPid = 0;
  mounts = 0;
  helperDir = '';
  hubSegment = 0;
  helperSegment = 0;

  nextSegments(): void {
    this.hubSegment += 1;
    this.helperSegment += 1;
  }

  setHelper(pid: number): void {
    this.helperPid = pid;
  }

  nextHelper(): string {
    this.mounts += 1;
    this.helperSegment = 0;
    this.helperDir = join(probeRoot, `helper-${String(this.mounts)}`);
    return this.helperDir;
  }
}

function harvester(input: SeInput, state: State): (keep: string | null) => Promise<void> {
  const { hub, session } = input;
  return async (keep) => {
    state.nextSegments();
    await mkdir(state.helperDir, { recursive: true });
    const hubSegment = {
      directory: hubProbe,
      prefix: 'hub',
      segment: state.hubSegment,
      files: HUB_FILES,
    };
    const helperSegment = {
      directory: state.helperDir,
      prefix: 'helper',
      segment: state.helperSegment,
      files: HELPER_FILES,
    };
    await harvest({ ...hubSegment, pid: hub.pid, signal: 'SIGUSR2' });
    await harvest({ ...helperSegment, pid: state.helperPid, signal: 'SIGUSR1' });
    if (keep === null) {
      await dropSegment(hubSegment);
      await dropSegment(helperSegment);
      return;
    }
    await keepSegment(hubSegment, session.profiles, keep);
    await keepSegment(helperSegment, session.profiles, keep);
  };
}

export function seKind(input: SeInput): Probed {
  const { hub, binary, session, variant } = input;
  const state = new State();
  const flag = join(hubProbe, 'parallel');
  const base = seTarget(hub.production, variant.maxBackground, binary, {
    kind: variant.kind,
    env: () => {
      return { SE_DRIVE_MOUNT_BENCH: state.nextHelper() };
    },
    mounted: (pid) => {
      state.setHelper(pid);
      return Promise.resolve();
    },
  });
  const harvestBoth = harvester(input, state);
  return {
    ...base,
    setup: () => Promise.resolve(),
    teardown: () => base.unmount(),
    async mount(): Promise<void> {
      if (variant.parallel) await writeFile(flag, '');
      await base.mount();
    },
    async unmount(): Promise<void> {
      await base.unmount();
      await rm(flag, { force: true });
    },
    roles: () => ({
      client: state.helperPid === 0 ? [] : [state.helperPid],
      server: [hub.pid],
    }),
    async diagnose(label): Promise<void> {
      process.kill(state.helperPid, 'SIGQUIT');
      await mkdir(session.profiles, { recursive: true });
      await sleep(1500);
      await copyFile(bench.helperLog, join(session.profiles, `${label}.hang.helper.log`));
    },
    async recover(): Promise<void> {
      await base.unmount();
      await base.mount();
    },
    before: () => harvestBoth(null),
    after: (label) => harvestBoth(label),
  };
}
