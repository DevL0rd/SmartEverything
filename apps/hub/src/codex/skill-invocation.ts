import { join } from 'node:path';
import {
  CODEX_COMMAND_CONFIGURATION,
  type CodexCommandConfiguration,
  type AiNativeCommandDispatch,
  type AiNativeCommandDescriptor,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
  type CodexProviderTurn,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { canonicalRuntimeInput } from '../computers/runtime-receipts';
import { CodexInputs } from './inputs';
import type { CodexClient } from './client';
import type { CodexJob } from './job';
import { CodexRuntimeError } from './errors';
import { TURN_REPLY, type RpcRecord } from './protocol';
import { threadOptions, turnOptions, validateModel } from './options';
import { requireCommandIdle } from './command-admission';
import { codexSkillDescriptor } from './skill-catalogue';
import { SKILL_USER_INPUT, type SKILLS_LIST_REPLY } from './skills-protocol';
import type { CommandPorts } from './provider-commands';
import { messageOf } from '@smarteverything/logging';
export interface SkillOperation {
  readonly input: AiNativeCommandWrite;
  receipt: AiNativeCommandReceipt;
}
interface PreparedSkill {
  readonly previous: CodexJob;
  readonly turn: CodexProviderTurn;
  readonly inputs: CodexInputs;
  readonly input: readonly RpcRecord[];
  readonly configured: string;
  readonly models: string;
  readonly selected: AiNativeCommandDescriptor;
}
interface SkillPorts extends CommandPorts {
  readonly save: (operation: SkillOperation, receipt: AiNativeCommandReceipt) => void;
  readonly bound: (input: AiNativeCommandWrite) => CodexJob;
  readonly fresh: (job: CodexJob) => Promise<z.infer<typeof SKILLS_LIST_REPLY>['data'][number]>;
  readonly peek: (job: CodexJob) => z.infer<typeof SKILLS_LIST_REPLY>['data'][number];
  readonly check: (job: CodexJob, turn: CodexProviderTurn) => Promise<void>;
  readonly create: (
    previous: CodexJob,
    turn: CodexProviderTurn,
    operation: SkillOperation,
    cleanup: () => void,
  ) => CodexJob;
}
export class CodexSkillInvocation {
  private readonly prepared = new Map<string, PreparedSkill>();
  constructor(private readonly ports: SkillPorts) {}
  clientClosed(client: CodexClient): void {
    for (const [id, prepared] of this.prepared)
      if (prepared.previous.client === client) {
        void prepared.inputs.remove().catch((cause: unknown): void => {
          this.ports.cleanupFailed(cause);
        });
        this.prepared.delete(id);
      }
  }
  stop(): void {
    for (const prepared of this.prepared.values())
      void prepared.inputs.remove().catch((cause: unknown): void => {
        this.ports.cleanupFailed(cause);
      });
    this.prepared.clear();
  }
  async prepare(operation: SkillOperation, raw: CodexCommandConfiguration): Promise<void> {
    let inputs: CodexInputs | null = null;
    let reserved = false;
    try {
      const previous = this.ports.bound(operation.input);
      requireCommandIdle(previous);
      const configuration = CODEX_COMMAND_CONFIGURATION.parse(raw);
      const configured = canonicalRuntimeInput(this.ports.configured());
      selectSkill(this.ports.peek(previous), operation.input.definition_id);
      const selected = selectSkill(await this.ports.fresh(previous), operation.input.definition_id);
      const turn = skillTurn(previous, operation.input, configuration);
      this.ports.admission.reserve(turn);
      reserved = true;
      const models = await this.ports.models();
      validateModel(turn, models);
      await this.ports.check(previous, turn);
      inputs = new CodexInputs(join(this.ports.dataDirectory, 'codex', 'inputs'));
      const input = await inputs.prepare(turn);
      const final = selectSkill(await this.ports.fresh(previous), operation.input.definition_id);
      this.ports.bound(operation.input);
      requireCommandIdle(previous);
      if (
        canonicalRuntimeInput(selected) !== canonicalRuntimeInput(final) ||
        configured !== canonicalRuntimeInput(this.ports.configured())
      )
        throw new CodexRuntimeError(
          'provider_command',
          'The native skill or configured execution options changed during preparation.',
        );
      this.prepared.set(operation.input.operation_id, {
        previous,
        turn,
        inputs,
        input,
        configured,
        models: canonicalRuntimeInput(models),
        selected: final,
      });
    } catch (cause) {
      if (inputs !== null) await inputs.remove();
      this.reject(operation, cause);
    } finally {
      if (reserved) this.ports.admission.release(operation.input.scope.chat_id);
    }
  }
  async dispatch(
    operation: SkillOperation,
    decision: AiNativeCommandDispatch,
  ): Promise<AiNativeCommandReceipt> {
    if (operation.receipt.status !== 'pending') return operation.receipt;
    const prepared = this.prepared.get(operation.input.operation_id);
    if (prepared === undefined)
      throw new CodexRuntimeError(
        'provider_command',
        'The skill command has no verified preparation.',
      );
    if (!decision.permit) {
      this.reject(
        operation,
        new CodexRuntimeError(
          'provider_command',
          decision.reason ?? 'The initiating authority was revoked.',
        ),
      );
      this.prepared.delete(operation.input.operation_id);
      await prepared.inputs.remove();
      return operation.receipt;
    }
    const submitted = await this.submit(operation, prepared);
    this.prepared.delete(operation.input.operation_id);
    if (!submitted) await prepared.inputs.remove();
    return operation.receipt;
  }
  private async submit(operation: SkillOperation, prepared: PreparedSkill): Promise<boolean> {
    let release: (() => void) | null = null;
    let job: CodexJob | null = null;
    try {
      const previous = this.ports.bound(operation.input);
      requireCommandIdle(previous);
      release = this.ports.admission.control(previous);
      await this.ports.check(previous, prepared.turn);
      this.validatePrepared(operation, prepared, previous);
      job = this.ports.create(previous, prepared.turn, operation, () => {
        void prepared.inputs.remove().catch((cause: unknown): void => {
          this.ports.cleanupFailed(cause);
        });
      });
      this.ports.retain(job);
      job.accepted();
      this.ports.bound(operation.input);
      const input = [
        SKILL_USER_INPUT.parse({
          type: 'skill',
          name: prepared.selected.native_name,
          path: prepared.selected.path,
        }),
        ...prepared.input,
      ];
      const pending = job.client.request('turn/start', {
        threadId: job.threadId,
        input,
        model: prepared.turn.model,
        effort: prepared.turn.effort,
        ...threadOptions(prepared.turn.options, job.cwd, job.roots),
        ...turnOptions(prepared.turn.options),
      });
      await this.acknowledge(job, pending);
      return true;
    } catch (cause) {
      if (job !== null) job.rejected(messageOf(cause));
      this.reject(operation, cause);
      return false;
    } finally {
      release?.();
    }
  }
  private validatePrepared(
    operation: SkillOperation,
    prepared: PreparedSkill,
    previous: CodexJob,
  ): void {
    const selected = selectSkill(this.ports.peek(previous), operation.input.definition_id);
    if (
      previous !== prepared.previous ||
      canonicalRuntimeInput(selected) !== canonicalRuntimeInput(prepared.selected) ||
      prepared.configured !== canonicalRuntimeInput(this.ports.configured()) ||
      prepared.models !== canonicalRuntimeInput(this.ports.observedModels()) ||
      !this.ports.ordinaryAllowed()
    )
      throw new CodexRuntimeError(
        'provider_command',
        'The prepared native skill, model, execution options or subscription availability changed.',
      );
    validateModel(prepared.turn, this.ports.observedModels());
  }
  private acknowledge(job: CodexJob, pending: Promise<unknown>): Promise<void> {
    return pending
      .then((reply) => {
        job.started(TURN_REPLY.parse(reply).turn.id);
      })
      .catch((cause: unknown) => {
        if (cause instanceof CodexRuntimeError && !cause.uncertain) job.rejected(cause.message);
        else
          job.lost(
            'The native skill submission was not confirmed; this operation will not be replayed.',
          );
      });
  }
  private reject(operation: SkillOperation, cause: unknown): void {
    this.ports.save(operation, {
      ...operation.receipt,
      status: 'rejected',
      text: messageOf(cause).slice(0, 2000),
    });
  }
}
function skillTurn(
  previous: CodexJob,
  input: AiNativeCommandWrite,
  configuration: CodexCommandConfiguration,
): CodexProviderTurn {
  const content: CodexProviderTurn['messages'][number]['content'] = [];
  if (input.arguments !== '') content.push({ type: 'text', text: input.arguments });
  for (const attachment of input.attachments) {
    if (attachment.type !== 'image')
      throw new CodexRuntimeError(
        'provider_command',
        'Native Codex skills accept images; file receipts require explicit staging.',
      );
    content.push({ type: 'image', media_type: attachment.mediaType, data: attachment.data });
  }
  return {
    ...previous.turn,
    ...configuration,
    job_id: input.command_job_id,
    session_id: previous.threadId,
    messages: [{ role: 'user', content }],
  };
}
function selectSkill(
  entry: z.infer<typeof SKILLS_LIST_REPLY>['data'][number],
  id: string,
): AiNativeCommandDescriptor {
  const selected = entry.skills
    .map((skill) => codexSkillDescriptor(skill, true))
    .filter((skill) => skill.definition_id === id);
  const skill = selected.length === 1 ? selected[0] : undefined;
  if (skill?.enabled !== true || skill.path === null)
    throw new CodexRuntimeError(
      'provider_command',
      'The exact native skill identity is unknown, duplicated or disabled.',
    );
  return skill;
}
