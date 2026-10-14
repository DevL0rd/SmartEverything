import { mkdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import {
  type CodexProviderOptions,
  type CodexProviderTurn,
  type ComputerRuntimeModel,
} from '@smarteverything/domain';
import { CodexRuntimeError } from './errors';
import { THREAD_REPLY, type RpcRecord } from './protocol';
export async function executionOptions(
  options: CodexProviderOptions,
  managedDirectory?: string,
): Promise<{ readonly cwd: string; readonly roots: readonly string[] }> {
  let selected = options.cwd;
  if (selected === undefined) {
    if (managedDirectory === undefined)
      throw new CodexRuntimeError(
        'cwd',
        'The selected computer has no managed workspace configured.',
      );
    await mkdir(managedDirectory, { recursive: true, mode: 0o700 });
    selected = managedDirectory;
  }
  const cwd = await directory(selected);
  const roots = await Promise.all((options.additional_directories ?? []).map(directory));
  return { cwd, roots };
}
async function directory(path: string): Promise<string> {
  if (!isAbsolute(path))
    throw new CodexRuntimeError(
      'cwd',
      'Workspace roots must be absolute paths on the selected computer.',
    );
  const resolved = await realpath(path);
  if (!(await stat(resolved)).isDirectory())
    throw new CodexRuntimeError('cwd', 'The selected computer workspace path is not a directory.');
  return resolved;
}
export function threadOptions(
  options: CodexProviderOptions,
  cwd: string,
  roots: readonly string[],
): RpcRecord {
  return {
    cwd,
    runtimeWorkspaceRoots: [cwd, ...roots],
    ...(options.approval_policy === undefined ? {} : { approvalPolicy: options.approval_policy }),
    ...(options.service_tier === undefined ? {} : { serviceTier: options.service_tier }),
  };
}
export function turnOptions(options: CodexProviderOptions): RpcRecord {
  return {
    ...(options.sandbox_policy === undefined ? {} : { sandboxPolicy: options.sandbox_policy }),
    ...(options.output_schema === undefined ? {} : { outputSchema: options.output_schema }),
    ...(options.service_tier === undefined ? {} : { serviceTier: options.service_tier }),
  };
}
export function validateModel(
  turn: Pick<CodexProviderTurn, 'model' | 'effort' | 'messages' | 'options'>,
  models: readonly ComputerRuntimeModel[],
): void {
  const model = models.find(
    (candidate) => candidate.id === turn.model || candidate.resolved_model === turn.model,
  );
  if (model?.available !== true)
    throw new CodexRuntimeError(
      'model',
      'The selected Codex model is unavailable on this computer.',
    );
  if (turn.effort !== null && !model.efforts.includes(turn.effort))
    throw new CodexRuntimeError(
      'effort',
      'This Codex model does not advertise the selected effort.',
    );
  if (
    turn.options.service_tier !== undefined &&
    model.service_tiers?.includes(turn.options.service_tier) !== true
  )
    throw new CodexRuntimeError(
      'service_tier',
      'This Codex model does not advertise the selected service tier.',
    );
  validateContent(turn.messages, model);
}
function validateContent(
  messages: CodexProviderTurn['messages'],
  model: ComputerRuntimeModel,
): void {
  for (const message of messages)
    for (const content of message.content) {
      if (content.type === 'document')
        throw new CodexRuntimeError(
          'content',
          'PDF inputs require an explicit conversion; this Codex adapter does not convert PDFs.',
        );
      if (!model.input_modalities.includes(content.type))
        throw new CodexRuntimeError(
          'content',
          'The selected Codex model does not advertise this input modality.',
        );
    }
}

export function requireExecutionLocation(
  raw: unknown,
  location: { readonly cwd: string; readonly roots: readonly string[] },
): void {
  const reply = THREAD_REPLY.parse(raw);
  if (
    reply.cwd !== location.cwd ||
    reply.thread.cwd !== location.cwd ||
    JSON.stringify(reply.runtimeWorkspaceRoots) !==
      JSON.stringify([location.cwd, ...location.roots])
  )
    throw new CodexRuntimeError(
      'thread/start',
      'Codex reported different execution folders than selected on this computer.',
      true,
    );
}
