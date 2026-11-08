import { describe, expect, it } from 'vitest';
import { HELPER_DIALOGUE } from '@smarteverything/domain';
import { mentionIndexOf, mentionsOf, tokensOf } from './mentions';
import { assistantParticipant, helperParticipant, type Participant } from './participant';

const NOVA = helperParticipant({
  helper_chat_id: '00000000-0000-4000-8000-000000000004',
  helper_name: 'Nova',
});
const ME: Participant = {
  id: 'me',
  name: 'Ana',
  kind: 'me',
  ink: 'viz-1',
  avatar: { kind: 'letter', letter: 'A' },
};
const INDEX = mentionIndexOf([assistantParticipant('My coordinator'), NOVA, ME]);

describe('tokensOf', () => {
  it('splits text around roster mentions and keeps unknown words plain', () => {
    expect(tokensOf('hi @nova, and @Ghost please', INDEX)).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', text: '@nova', participantId: NOVA.id, ink: NOVA.ink, self: false },
      { kind: 'text', text: ', and @Ghost please' },
    ]);
  });

  it('matches names with spaces and flags a mention of the viewer as self', () => {
    const tokens = tokensOf('@My coordinator tell @Ana', INDEX);
    expect(tokens).toEqual([
      {
        kind: 'mention',
        text: '@My coordinator',
        participantId: 'assistant',
        ink: 'primary',
        self: false,
      },
      { kind: 'text', text: ' tell ' },
      { kind: 'mention', text: '@Ana', participantId: 'me', ink: 'viz-1', self: true },
    ]);
  });

  it('ignores partial names, emails and text without mentions', () => {
    expect(tokensOf('@Novaz and a@nova.example', INDEX)).toBeNull();
    expect(tokensOf('no mention', INDEX)).toBeNull();
    expect(tokensOf('@Nova', null)).toBeNull();
  });

  it('treats regex characters in names literally', () => {
    const odd = mentionIndexOf([{ ...NOVA, id: 'x', name: 'A.B (c)' }]);
    expect(tokensOf('@A.B (c) hi', odd)?.[0]).toMatchObject({
      kind: 'mention',
      participantId: 'x',
    });
    expect(tokensOf('@AxB (c) hi', odd)).toBeNull();
  });
});

describe('mentionsOf', () => {
  const toHelper = HELPER_DIALOGUE.parse({
    kind: 'helper_dialogue',
    direction: 'to_helper',
    helper_chat_id: '00000000-0000-4000-8000-000000000004',
    helper_name: 'Nova',
  });

  it('adds a leading mention for a message to a helper that does not start with one', () => {
    expect(mentionsOf({ text: 'check the lights', embeds: [toHelper] }, INDEX)).toEqual([
      { kind: 'mention', text: '@Nova', participantId: NOVA.id, ink: NOVA.ink, self: false },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: 'check the lights' },
    ]);
  });

  it('keeps a message that already starts with the mention as it is', () => {
    const tokens = mentionsOf({ text: '@Nova check the lights', embeds: [toHelper] }, INDEX);
    expect(tokens).toHaveLength(2);
    expect(tokens?.[0]).toMatchObject({ participantId: NOVA.id });
  });

  it('adds nothing to an ordinary message without mentions', () => {
    expect(mentionsOf({ text: 'hello', embeds: [] }, INDEX)).toBeNull();
  });
});
