import { admitUnboundEngineChange } from '../../../harness/engine-change-admission';
import type { HarnessService } from '../../../harness/service';
import type { EngineSelections } from '../../engine-selections';
import { ApiError, isCodexPermissionOnlyChange } from '@smarteverything/domain';
import type { AiChatRow, AiChatChange } from '@smarteverything/domain';
import type { ChatOwner } from '../../chat-directory';
import type { EngineRegistry } from '../registry';

export function admitHarnessChange(before: AiChatRow, change: AiChatChange): void {
  if (
    before.engine.kind !== 'dsh' ||
    before.engine.session_id === null ||
    change.engine?.kind !== 'dsh'
  )
    return;
  if (JSON.stringify(before.engine) !== JSON.stringify(change.engine))
    throw new ApiError(
      'conflict',
      'Use the native host/route switch for an existing session. Its recorded permission policy requires a separate admitted native policy change; editing the engine record cannot rewrite it.',
    );
}
export async function closeReplacedHarness(
  engines: EngineRegistry,
  owner: ChatOwner,
  before: AiChatRow,
  change: AiChatChange,
): Promise<void> {
  if (before.engine.kind === 'dsh' && change.engine !== undefined && change.engine.kind !== 'dsh')
    await engines.forMutation(before, owner.role)?.historyChanged(before, owner);
}

export function selectChatEngineChange(
  ports: {
    readonly selections: EngineSelections | null;
    readonly harness: HarnessService | null;
    readonly owner: ChatOwner;
  },
  before: AiChatRow,
  change: AiChatChange,
): AiChatChange {
  if (change.engine === undefined) return change;
  if (ports.selections === null)
    throw new ApiError('conflict', 'The assistant is starting. Try again in a moment.');
  const engine = ports.selections.select(before.profile_id, change.engine);
  if (engine.kind === 'dsh') {
    if (ports.harness === null)
      throw new ApiError('conflict', 'SmartEverything runtime is starting.');
    return {
      ...change,
      engine: admitUnboundEngineChange(ports.harness, ports.owner, before, engine),
    };
  }
  return { ...change, engine };
}

export function codexPermissionChange(before: AiChatRow, change: AiChatChange): boolean {
  return (
    change.engine !== undefined &&
    change.tools === undefined &&
    isCodexPermissionOnlyChange(before.engine, change.engine)
  );
}
