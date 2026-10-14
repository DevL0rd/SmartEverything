import { randomUUID } from 'node:crypto';
import type { OnElicitation, OnUserDialog } from '@anthropic-ai/claude-agent-sdk';
import { JSON_VALUE, type ProviderAnswer } from '@smarteverything/domain';
import { z } from 'zod';
import { ProviderCallbackError, ProviderPending } from './pending';
import type { ProviderPayload } from './events';

type ElicitationResult = NonNullable<Awaited<ReturnType<OnElicitation>>>;

const RESPONSE = z.discriminatedUnion('behavior', [
  z.strictObject({ behavior: z.literal('cancelled') }),
  z.strictObject({ behavior: z.literal('completed'), result: JSON_VALUE }),
]);
const CONTENT = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);
const ELICITATION = z.strictObject({
  action: z.enum(['accept', 'decline', 'cancel']),
  content: CONTENT.optional(),
});

export class ProviderDialogs {
  private readonly pending = new ProviderPending<ProviderAnswer>();
  constructor(private readonly emit: (payload: ProviderPayload) => void) {}

  readonly elicitation: OnElicitation = async (request, context) => {
    const id = context.requestId || randomUUID();
    const waiting = this.pending.hold(id, context.signal);
    const dialog = {
      kind: 'dialog',
      prompt_id: id,
      dialog_kind: `elicitation_${request.mode ?? 'form'}`,
      request: z.record(z.string(), JSON_VALUE).parse(JSON.parse(JSON.stringify(request))),
    } as const;
    this.emit({ ...dialog, status: 'pending' });
    let answer: ProviderAnswer;
    try {
      answer = await waiting;
    } catch (cause) {
      if (!(cause instanceof ProviderCallbackError)) throw cause;
      this.emit({ ...dialog, status: 'expired' });
      return { action: 'cancel' };
    }
    try {
      const result = answeredElicitation(answer, request.requestedSchema);
      this.emit({ ...dialog, status: result.action === 'cancel' ? 'expired' : 'answered' });
      return result;
    } catch (cause) {
      this.emit({ ...dialog, status: 'expired' });
      throw cause;
    }
  };

  readonly userDialog: OnUserDialog = (request) => {
    this.emit({
      kind: 'runtime',
      type: 'unsupported_user_dialog',
      payload: {
        dialog_kind: request.dialogKind,
        reason:
          'The installed SDK has no exported dialog-specific response schema; this kind is not advertised to the CLI.',
      },
    });
    return Promise.resolve({ behavior: 'cancelled' });
  };

  answer(id: string, answer: ProviderAnswer): boolean {
    if (answer.decision === 'dialog') RESPONSE.parse(answer.response);
    if (answer.decision === 'elicitation')
      ELICITATION.parse({
        action: answer.action,
        ...(answer.content === undefined ? {} : { content: answer.content }),
      });
    return this.pending.answer(id, answer);
  }
  stop(): void {
    this.pending.stop('The provider dialog was cancelled.');
  }
}

function validatedElicitation(
  parsed: z.infer<typeof ELICITATION>,
  schema: Parameters<OnElicitation>[0]['requestedSchema'],
): ElicitationResult {
  if (parsed.action === 'accept' && schema !== undefined) {
    const validated = z.fromJSONSchema(schema).parse(parsed.content);
    return { action: 'accept', content: CONTENT.parse(validated) };
  }
  return {
    action: parsed.action,
    ...(parsed.content === undefined ? {} : { content: parsed.content }),
  };
}

function answeredElicitation(
  answer: ProviderAnswer,
  schema: Parameters<OnElicitation>[0]['requestedSchema'],
): ElicitationResult {
  if (answer.decision !== 'elicitation') return { action: 'cancel' };
  return validatedElicitation(
    ELICITATION.parse({
      action: answer.action,
      ...(answer.content === undefined ? {} : { content: answer.content }),
    }),
    schema,
  );
}
