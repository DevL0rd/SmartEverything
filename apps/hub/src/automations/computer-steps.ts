import {
  ApiError,
  AUDIO_STATE,
  DISPLAY_REVERT_SECONDS,
  DISPLAY_STATE,
  displayChangeNeedsRevert,
  displayKeepProblem,
  walkSteps,
  type AutomationV2,
  type StepV2,
} from '@smarteverything/domain';
import { currentExecutionAuthority, executionRole } from '../assistant/turn-authority';
import { hiddenComputer, viewerOf, type ComputerViewer } from '../computers/computer-access';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import type { AutomationComputersSlot } from './automation-computers';
import { awaitRun, type RunContext } from './run-context';

type AudioStep = Extract<StepV2, { do: 'audio' }>;
type DisplayStep = Extract<StepV2, { do: 'display' }>;

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

export class ComputerSteps {
  constructor(private readonly slot: AutomationComputersSlot) {}

  async audio(step: AudioStep, context: RunContext): Promise<null> {
    const request = { verb: 'audio_set', change: step.change } as const;
    await awaitRun(
      this.slot.current().ask(runViewer(), step.computer, request, AUDIO_STATE),
      context,
    );
    return null;
  }

  async display(step: DisplayStep, context: RunContext): Promise<string | null> {
    const { change } = step;
    const request = {
      verb: 'display_set',
      change,
      revert: displayChangeNeedsRevert(change),
    } as const;
    const applied = await awaitRun(
      this.slot.current().ask(runViewer(), step.computer, request, DISPLAY_STATE),
      context,
    );
    const pending = applied.pendingRevert;
    if (pending === null) return null;
    if (step.keep !== true) {
      return `Goes back after ${String(DISPLAY_REVERT_SECONDS)} seconds unless someone keeps it at the computer.`;
    }
    const problem = displayKeepProblem(change, applied);
    const decision = {
      verb: 'display_confirm',
      token: pending.token,
      keep: problem === null,
    } as const;
    await this.slot.current().ask(runViewer(), step.computer, decision, DISPLAY_STATE);
    if (problem !== null) throw new DisplayNotKeptError(problem);
    return null;
  }
}

export function requireVisibleComputers(
  store: Store,
  caller: Caller,
  definition: Pick<AutomationV2, 'steps'>,
): void {
  const viewer = viewerOf(store, caller);
  for (const step of walkSteps(definition.steps)) {
    if (step.do !== 'audio' && step.do !== 'display') continue;
    if (hiddenComputer(store, viewer, store.devices.byId(step.computer)))
      throw new ApiError('forbidden', 'A member can only automate their own computers.');
  }
}
