import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { callPreviewOf, callTitleOf, callTurnsOf } from './call-transcript';

function callRow(text: string, embeds: AssistantMessageRow['embeds'] = []): AssistantMessageRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'system',
    kind: 'call',
    author: 'Coordinator',
    text,
    attachments: [],
    state: null,
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: { source: 'voice', plugin_id: null, device_id: null, name: 'Me' },
    embeds,
    cost_micros: 0,
    model: null,
    created_at: '2026-10-09T10:00:00.000Z',
    updated_at: '2026-10-09T10:03:00.000Z',
  };
}

const LEGACY = [
  'Me: Talk to me from the living room camera.',
  '· List devices',
  '· Unmute the living room camera',
  'Coordinator: Done, I can hear you there.',
  'It may take a second.',
].join('\n');

describe('call transcripts', () => {
  it('parses the legacy text into speakers and tool turns', () => {
    expect(callTurnsOf(callRow(LEGACY)).map((turn) => [turn.who, turn.text])).toEqual([
      ['person', 'Talk to me from the living room camera.'],
      ['tool', 'List devices'],
      ['tool', 'Unmute the living room camera'],
      ['assistant', 'Done, I can hear you there.\nIt may take a second.'],
    ]);
  });

  it('prefers the structured embed', () => {
    const turns = [{ who: 'person' as const, text: 'Hi', ok: true, detail: null }];
    const row = callRow(LEGACY, [{ kind: 'call_transcript', turns }]);
    expect(callTurnsOf(row)).toEqual(turns);
  });

  it('previews the last spoken line without labels or tools', () => {
    expect(callPreviewOf(callRow(LEGACY))).toBe(
      'Done, I can hear you there. It may take a second.',
    );
    expect(callPreviewOf(callRow('· List devices'))).toBe(callTitleOf(callRow('')));
  });
});
