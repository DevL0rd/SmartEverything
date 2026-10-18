import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_MESSAGE_ROW,
  CHAT_TIMELINE_EMBED,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { wireMessage } from '../../src/assistant/wire-message';

const ID = '00000000-0000-4000-8000-000000000001';
const AT = '2026-10-17T00:00:00.000Z';

function rowWith(state: AssistantMessageRow['state'], output: string): AssistantMessageRow {
  return ASSISTANT_MESSAGE_ROW.parse({
    id: ID,
    profile_id: ID,
    client_id: null,
    role: 'responder',
    kind: 'text',
    author: 'Assistant',
    text: 'done',
    attachments: [],
    state,
    reason: null,
    steps: [],
    reply_to: null,
    chat_id: ID,
    origin: null,
    embeds: [
      {
        kind: 'chat_timeline',
        version: 1,
        parts: [
          {
            kind: 'tool',
            key: 't1',
            tool: {
              callId: 'call-1',
              name: 'bash',
              title: 'bash',
              state: 'done',
              detail: null,
              input: null,
              output,
              redacted: false,
              image_operation_id: null,
            },
          },
        ],
      },
    ],
    cost_micros: 0,
    model: null,
    created_at: AT,
    updated_at: AT,
  });
}

function outputOf(row: AssistantMessageRow): { text: string | null; chars: number | undefined } {
  const timeline = CHAT_TIMELINE_EMBED.parse(row.embeds[0]);
  const part = timeline.parts[0];
  if (part?.kind !== 'tool') throw new Error('expected a tool part');
  return { text: part.tool.output, chars: part.tool.output_chars };
}

describe('wireMessage', () => {
  const output = JSON.stringify({ exit_code: 0, text: 'y'.repeat(4_000) });

  it('sends settled messages with compact tool results and the full length', () => {
    const shown = outputOf(wireMessage(rowWith('answered', output)));

    expect(shown.text?.length).toBeLessThan(output.length);
    expect(shown.chars).toBe(output.length);
    expect(JSON.parse(shown.text ?? '')).toMatchObject({ exit_code: 0 });
  });

  it('sends a message that is still being written untouched', () => {
    const row = rowWith('working', output);

    expect(wireMessage(row)).toBe(row);
  });
});
