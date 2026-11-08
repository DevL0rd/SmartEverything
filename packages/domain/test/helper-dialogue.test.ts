import { describe, expect, it } from 'vitest';
import { ASSISTANT_NEW_MESSAGE } from '../src/api/endpoints-assistant';
import { HELPER_DIALOGUE, helperDialogueOf, isHelperDialogueMessage } from '../src/assistant';

const ID = '11111111-1111-4111-8111-111111111111';
const QUOTE = '22222222-2222-4222-8222-222222222222';

describe('structured helper dialogue', () => {
  it('keeps a typed mention as text until the request names an actual helper ID', () => {
    expect(
      ASSISTANT_NEW_MESSAGE.parse({ text: '@Nova, how did it go?' }).helper_target,
    ).toBeUndefined();
    const target = { chat_id: ID };
    const parsed = ASSISTANT_NEW_MESSAGE.parse({
      text: 'Did it reproduce?',
      client_message_id: ID,
      helper_target: target,
      quote_message_id: QUOTE,
    });
    expect(parsed.helper_target).toEqual(target);
    expect(parsed.quote_message_id).toBe(QUOTE);
  });

  it('requires an idempotency key and refuses a client-supplied actor or display name', () => {
    expect(
      ASSISTANT_NEW_MESSAGE.safeParse({ text: 'Hi', helper_target: { chat_id: ID } }).success,
    ).toBe(false);
    expect(
      ASSISTANT_NEW_MESSAGE.safeParse({
        text: 'Hi',
        client_message_id: ID,
        helper_target: { chat_id: ID, helper_name: 'Nova' },
      }).success,
    ).toBe(false);
    expect(
      ASSISTANT_NEW_MESSAGE.safeParse({
        text: 'Hi',
        client_message_id: ID,
        helper_target: { chat_id: ID, quoted_message_id: QUOTE },
      }).success,
    ).toBe(false);
  });

  it('requires the durable name and carries no quote of its own', () => {
    const row = {
      kind: 'helper_dialogue',
      direction: 'from_helper',
      helper_chat_id: ID,
      helper_name: 'Nova',
    };
    expect(HELPER_DIALOGUE.parse(row)).toEqual(row);
    expect(helperDialogueOf({ embeds: [row] })).toEqual(row);
    expect(helperDialogueOf({ embeds: [] })).toBeUndefined();
    expect(isHelperDialogueMessage({ embeds: [{ kind: 'helper_input' }] })).toBe(true);
    expect(isHelperDialogueMessage({ embeds: [row] })).toBe(true);
    expect(isHelperDialogueMessage({ embeds: [{ kind: 'other' }] })).toBe(false);
    expect(HELPER_DIALOGUE.safeParse({ ...row, helper_name: '' }).success).toBe(false);
    expect(HELPER_DIALOGUE.safeParse({ ...row, quoted_message_id: QUOTE }).success).toBe(false);
  });
});
