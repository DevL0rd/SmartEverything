import type { StepRecord } from '@smarteverything/flow/interpret/frames';
import type { CancelReason } from '@smarteverything/flow/state/run-state';
import type { Clock } from '../../clock';
import type { DriverPorts } from '../driver/ports';
import type { WorldReadDeps } from '../world-v3/deps';
import type { BreakpointHit, Proceed } from './breakpoints';
import type { WouldSend } from './effects-sim';
import { SimRig } from './rig';
import type { RunReport, SimStart } from './rig';
import { OVERRIDES } from './scenario';
import type { Overrides } from './scenario';
import type { z } from 'zod';

interface LiveSide {
  readonly clock: Clock;
  readonly watch: DriverPorts['watch'];
  readonly base: WorldReadDeps;
}

export interface DryRunRequest {
  readonly live: LiveSide;
  readonly start: SimStart;
  readonly overrides?: z.input<typeof OVERRIDES> | undefined;
  readonly breakpoints?: readonly string[] | undefined;
  readonly child?: ((automationId: string) => SimStart | undefined) | undefined;
}

export interface DryRunReport {
  readonly run: RunReport;
  readonly commands: readonly WouldSend[];
  readonly records: readonly StepRecord[];
  readonly paused: readonly BreakpointHit[];
}

export class DryRun {
  readonly runId: string;
  private readonly rig: SimRig;
  private readonly overrides: Overrides;

  constructor(request: DryRunRequest) {
    this.overrides = OVERRIDES.parse(request.overrides ?? {});
    this.rig = new SimRig({
      kind: 'dry',
      clock: request.live.clock,
      base: request.live.base,
      watching: (): DriverPorts['watch'] => request.live.watch,
      overrides: this.overrides,
      breakpoints: request.breakpoints ?? [],
      zone: undefined,
      child: request.child,
    });
    this.runId = this.rig.start(request.start);
  }

  get commands(): readonly WouldSend[] {
    return this.rig.commands;
  }

  get paused(): readonly BreakpointHit[] {
    return this.rig.paused;
  }

  proceed(how: Proceed): boolean {
    return this.rig.breakpoints.proceed(this.runId, how);
  }

  cancel(reason: CancelReason = 'user_stop'): boolean {
    return this.rig.driver.cancel(this.runId, reason);
  }

  async finished(): Promise<DryRunReport> {
    const run = await this.rig.completion(this.runId);
    return {
      run,
      commands: this.rig.commands,
      records: this.rig.records,
      paused: this.rig.paused,
    };
  }
}
