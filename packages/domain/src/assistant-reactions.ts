import { z } from 'zod';
import { ID } from './api/primitives';
import { EMOJI_SEQUENCE } from './emoji/catalogue';

export const ASSISTANT_REACTION_ACTOR = z.strictObject({
  kind: z.enum(['person', 'assistant']),
  id: ID,
  label: z.string().min(1).max(120),
});

export const ASSISTANT_REACTION = z.strictObject({
  emoji: EMOJI_SEQUENCE,
  actor: ASSISTANT_REACTION_ACTOR,
});

export const ASSISTANT_REACTION_CHANGE = z.strictObject({
  emoji: EMOJI_SEQUENCE.describe('One complete Unicode emoji from the app catalogue'),
  present: z.boolean().describe('True to add your reaction, false to remove your reaction'),
  in_parent: z
    .boolean()
    .optional()
    .describe(
      'For a helper only: use the current delivered input messageId in your chat to react to its matching message in the parent conversation.',
    ),
});

export type AssistantReaction = z.infer<typeof ASSISTANT_REACTION>;
export type AssistantReactionActor = z.infer<typeof ASSISTANT_REACTION_ACTOR>;
export type AssistantReactionChange = z.infer<typeof ASSISTANT_REACTION_CHANGE>;

export function canReactToMessage(row: { readonly role: string; readonly kind: string }): boolean {
  return row.kind === 'text' && (row.role === 'person' || row.role === 'responder');
}
