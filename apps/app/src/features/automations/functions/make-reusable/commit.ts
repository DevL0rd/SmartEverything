import type { AutomationV3, Layout } from '@smarteverything/domain';
import type { FunctionExtractBody, ProgramUpdateBody } from '../../data/api';
import type { FunctionActions } from '../../data/use-functions';
import { failureText } from './dialog-model';

export interface CommitDeps {
  readonly functions: Pick<FunctionActions, 'extract' | 'remove'>;
  readonly automations: {
    readonly update: (automationId: string, body: ProgramUpdateBody) => Promise<unknown>;
  };
}

export interface Before {
  readonly program: AutomationV3;
  readonly layout: Layout;
}

export type CommitResult =
  | {
      readonly ok: true;
      readonly instanceKey: string | null;
      readonly undo: () => Promise<void>;
    }
  | { readonly ok: false; readonly message: string };

const GENERIC = 'The Custom Node could not be made.';

export async function commitExtraction(
  deps: CommitDeps,
  body: FunctionExtractBody,
  before: Before,
): Promise<CommitResult> {
  let reply;
  try {
    reply = await deps.functions.extract(body);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : GENERIC };
  }
  if (!reply.ok) return { ok: false, message: failureText(reply) };
  const { id: functionId, callerRevision } = reply;
  if (functionId === null || callerRevision === null) return { ok: false, message: GENERIC };
  return {
    ok: true,
    instanceKey: reply.instanceKey,
    undo: async (): Promise<void> => {
      await deps.automations.update(body.automationId, {
        definition: before.program,
        layout: before.layout,
        expectedRevision: callerRevision,
      });
      await deps.functions.remove(functionId);
    },
  };
}
