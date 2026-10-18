import { randomUUID } from 'node:crypto';
import {
  ApiError,
  PLUGIN_ORIGIN,
  SCENE_ACTIONS,
  identifiedAutomationV2,
  runInputError,
  walkSteps,
  type AutomationRow,
  type AutomationV2,
  type CommandAction,
  type PluginOrigin,
  type SignalInput,
  type StepV2,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  currentExecutionAuthority,
  inheritedOrigin,
  withExecutionAuthority,
} from '../assistant/turn-authority';
import type { Clock } from '../clock';
import { withEffectAuthority } from '../harness/effect-authority';
import { profileIdOf } from '../server/auth';
import { currentControlCaller } from '../server/local-control-context';
import type { Store } from '../store/store';
import type { SpeechOccurrence } from '../transcripts/speech';
import type { ActionRunner } from './actions';
import { definitionOf } from './definition';
import { admitManualAutomation } from './manual-run';
import type { OwnedAutomationRuns, OwnedRunAdmission, OwnedRunTask, RunPolicy } from './owned-runs';
import type { CallRequest } from './program-steps';
import type { RunContext, RunHooks } from './run-context';
import { failureLine } from '@smarteverything/logging';

const DRAFT_AUTOMATION_ID = '00000000-0000-0000-0000-000000000000';

export interface AutomationRun {
  readonly automationId: string;
  readonly name: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly error: string | null;
}

interface RunSubject {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly origin: PluginOrigin | null;
}

export interface StartRequest {
  readonly subject: RunSubject;
  readonly definition: AutomationV2;
  readonly trigger: SignalInput | null;
  readonly inputs: RunContext['inputs'];
  readonly occurrence?: SpeechOccurrence;
  readonly admit?: () => void;
  readonly parent?: RunContext;
  readonly waits?: boolean;
  readonly policy?: RunPolicy;
  readonly lasting?: boolean;
}

interface DraftRequest {
  readonly automationId?: string | undefined;
  readonly definition: AutomationV2;
  readonly inputs: RunContext['inputs'];
}

interface AutomationRunnerOptions {
  readonly store: Store;
  readonly runs: OwnedAutomationRuns;
  readonly actions: () => ActionRunner;
  readonly clock: Clock;
  readonly log: Logger;
  readonly recordRun: (run: AutomationRun) => void;
}

export function subjectOf(row: AutomationRow): RunSubject {
  return { id: row.id, name: row.name, revision: row.revision, origin: row.origin };
}

function runOwner(store: Store, id: string): string | null {
  const caller = currentControlCaller();
  return caller === undefined
    ? (store.harnessRecovery.effects.find('automation', id)?.profile_id ?? null)
    : profileIdOf(store, caller);
}

function mergedOrigin(
  saved: PluginOrigin | null,
  parent: PluginOrigin | null | undefined,
): PluginOrigin | null {
  const origins = [saved, parent].filter(
    (origin): origin is PluginOrigin => origin !== null && origin !== undefined,
  );
  const inherited = inheritedOrigin(origins);
  return inherited.plugin_id === null ? null : PLUGIN_ORIGIN.parse(inherited);
}

function sceneIds(steps: readonly StepV2[]): ReadonlySet<string> {
  return new Set(walkSteps(steps).flatMap((step) => (step.do === 'scene' ? [step.scene] : [])));
}

export class AutomationRunner {
  constructor(private readonly options: AutomationRunnerOptions) {}

  start(request: StartRequest): OwnedRunAdmission {
    const { subject, definition, parent } = request;
    const initiating = currentExecutionAuthority();
    const scenes = this.scenes(definition.steps);
    const ownerProfileId = this.ownerOf(request);
    const origin = mergedOrigin(subject.origin, parent?.origin);
    return this.options.runs.start({
      automationId: subject.id,
      revision: subject.revision,
      ownerProfileId,
      policy: request.policy ?? { mode: definition.mode ?? 'single', max: definition.max },
      ...(definition.key === undefined ? {} : { controlKey: definition.key }),
      ...(request.occurrence === undefined ? {} : { occurrence: request.occurrence }),
      ...this.link(request),
      ...this.guards(request, initiating),
      execute: (hooks) =>
        withExecutionAuthority(initiating, () =>
          this.execute(request, { hooks, scenes, ownerProfileId, origin }),
        ),
    });
  }

  private link(request: StartRequest): Pick<OwnedRunTask, 'parentRunId' | 'parentSignal'> {
    const { parent } = request;
    if (parent === undefined) return {};
    return {
      parentRunId: parent.runId,
      ...(request.waits === true ? { parentSignal: parent.signal } : {}),
    };
  }

  private guards(
    request: StartRequest,
    initiating: ReturnType<typeof currentExecutionAuthority>,
  ): Pick<OwnedRunTask, 'admit' | 'alive'> {
    const { admit } = request;
    return {
      ...(admit === undefined
        ? {}
        : {
            admit: (): void => {
              withExecutionAuthority(initiating, admit);
            },
          }),
      ...(request.lasting === true
        ? {
            alive: (): void => {
              this.requireEnabled(request.subject.id);
            },
          }
        : {}),
    };
  }

  call(request: CallRequest): OwnedRunAdmission {
    const row = this.options.store.automations.byId(request.automationId);
    return this.start({
      subject: subjectOf(row),
      definition: definitionOf(row),
      trigger: null,
      inputs: request.inputs,
      parent: request.parent,
      waits: request.waits,
    });
  }

  startSaved(row: AutomationRow, inputs: RunContext['inputs']): OwnedRunAdmission {
    const definition = definitionOf(row);
    admitManualAutomation(this.options.store, definition);
    this.requireInputs(definition, inputs);
    return this.start({
      subject: subjectOf(row),
      definition,
      trigger: null,
      inputs,
      lasting: row.enabled,
    });
  }

  startDraft(draft: DraftRequest): OwnedRunAdmission {
    const { store } = this.options;
    const saved =
      draft.automationId === undefined ? undefined : store.automations.find(draft.automationId);
    this.requireInputs(draft.definition, draft.inputs);
    return this.start({
      subject: {
        id: saved?.id ?? DRAFT_AUTOMATION_ID,
        name: saved?.name ?? 'Test',
        revision: saved?.revision ?? 1,
        origin: null,
      },
      definition: identifiedAutomationV2(draft.definition, randomUUID, false),
      trigger: null,
      inputs: draft.inputs,
      policy: { mode: 'parallel', max: undefined },
    });
  }

  private requireInputs(definition: AutomationV2, inputs: RunContext['inputs']): void {
    const problem = runInputError(definition.inputs, inputs);
    if (problem !== null) throw new ApiError('invalid_request', problem);
  }

  private requireEnabled(id: string): void {
    const row = this.options.store.automations.find(id);
    if (row === undefined)
      throw new ApiError('conflict', 'The automation was removed while its run was active.');
    if (!row.enabled)
      throw new ApiError('conflict', 'The automation was disabled while its run was active.');
  }

  private ownerOf(request: StartRequest): string | null {
    const { store } = this.options;
    if (request.parent !== undefined) return request.parent.ownerProfileId;
    if (request.occurrence === undefined) return runOwner(store, request.subject.id);
    return store.speech.grant(request.subject.id)?.principal.profileId ?? null;
  }

  private scenes(steps: readonly StepV2[]): Readonly<Record<string, readonly CommandAction[]>> {
    const { store } = this.options;
    return Object.fromEntries(
      [...sceneIds(steps)].map((id) => [id, SCENE_ACTIONS.parse(store.scenes.byId(id).actions)]),
    );
  }

  private async execute(
    request: StartRequest,
    run: {
      readonly hooks: RunHooks;
      readonly scenes: RunContext['scenes'];
      readonly ownerProfileId: string | null;
      readonly origin: PluginOrigin | null;
    },
  ): Promise<string | null> {
    const { store, clock, log, actions } = this.options;
    const { subject, definition } = request;
    const operation = log.operation('automation.run', {
      automationId: subject.id,
      runId: run.hooks.runId,
      revision: subject.revision,
      trigger:
        request.trigger === null
          ? request.parent === undefined
            ? 'manual'
            : 'called'
          : `${request.trigger.source}:${request.trigger.kind}`,
      parentRunId: request.parent?.runId,
      inputs: Object.keys(request.inputs).length,
    });
    const startedAt = clock.now();
    const context: RunContext = {
      ...run.hooks,
      automationId: subject.id,
      name: subject.name,
      ownerProfileId: run.ownerProfileId,
      origin: run.origin,
      trigger: request.trigger,
      inputs: request.inputs,
      scenes: run.scenes,
    };
    let error: string | null = null;
    try {
      await withEffectAuthority(store, 'automation', subject.id, () =>
        actions().run(definition.steps, context),
      );
      operation.succeeded();
    } catch (cause) {
      error = failureLine(cause);
      operation.failed(cause);
    }
    this.record(request, startedAt, error);
    return error;
  }

  private record(request: StartRequest, startedAt: Date, error: string | null): void {
    const { store, clock } = this.options;
    const { subject } = request;
    if (request.parent === undefined)
      this.options.recordRun({
        automationId: subject.id,
        name: subject.name,
        startedAt: startedAt.toISOString(),
        durationMs: clock.now().getTime() - startedAt.getTime(),
        error,
      });
    const row = store.automations.find(subject.id);
    if (row !== undefined)
      store.automations.recordRun(subject.id, {
        lastRunAt: clock.now().toISOString(),
        runCount: row.run_count + 1,
        lastError: error,
      });
  }
}
