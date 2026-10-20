import {
  AUDIO_STATE,
  DISPLAY_REVERT_SECONDS,
  DISPLAY_STATE,
  displayChangeNeedsRevert,
  displayKeepProblem,
  type AudioChange,
  type DisplayChange,
} from '@smarteverything/domain';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';
import type { ComputerViewer } from '../../computers/computer-access';
import type { AutomationComputersSlot } from '../automation-computers';
import { awaitRun } from './run-abort';
import type { EffectRun } from './effect-run';

export interface AudioRequest {
  readonly computer: string;
  readonly change: AudioChange;
}

export interface DisplayRequest {
  readonly computer: string;
  readonly change: DisplayChange;
  readonly keep: boolean;
}

const HOME_VIEWER: ComputerViewer = { owner: true, profileId: null };

class DisplayNotKeptError extends Error {
  override readonly name = 'DisplayNotKeptError';

  constructor(problem: string) {
    super(`The screen change was reverted instead of kept: ${problem}.`);
  }
}

export function runViewer(): ComputerViewer {
  const authority = currentExecutionAuthority();
  if (authority === undefined || executionRole(authority) === 'owner') return HOME_VIEWER;
  return { owner: false, profileId: authority.profile_id };
}

export class ComputerEffects {
  constructor(private readonly slot: AutomationComputersSlot) {}

  async audio({ computer, change }: AudioRequest, run: EffectRun): Promise<null> {
    const request = { verb: 'audio_set', change } as const;
    await awaitRun(this.slot.current().ask(runViewer(), computer, request, AUDIO_STATE), run);
    return null;
  }

  async display(
    { computer, change, keep }: DisplayRequest,
    run: EffectRun,
  ): Promise<string | null> {
    const request = {
      verb: 'display_set',
      change,
      revert: displayChangeNeedsRevert(change),
    } as const;
    const applied = await awaitRun(
      this.slot.current().ask(runViewer(), computer, request, DISPLAY_STATE),
      run,
    );
    const pending = applied.pendingRevert;
    if (pending === null) return null;
    if (!keep) {
      return `Goes back after ${String(DISPLAY_REVERT_SECONDS)} seconds unless someone keeps it at the computer.`;
    }
    const problem = displayKeepProblem(change, applied);
    const decision = {
      verb: 'display_confirm',
      token: pending.token,
      keep: problem === null,
    } as const;
    await this.slot.current().ask(runViewer(), computer, decision, DISPLAY_STATE);
    if (problem !== null) throw new DisplayNotKeptError(problem);
    return null;
  }
}
