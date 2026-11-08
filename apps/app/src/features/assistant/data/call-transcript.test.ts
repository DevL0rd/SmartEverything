import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import {
  callPreviewOf,
  callTitleOf,
  callTurnsOf,
  callViewOf,
  failedActionsOf,
  moreLinesOf,
} from './call-transcript';

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
    quote: null,
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

  it('titles the call with its length', () => {
    expect(callTitleOf(callRow(''))).toBe('Call · 3:00');
  });

  it('shows the first two lines and keeps every other line behind the trigger', () => {
    const view = callViewOf(callRow(LEGACY));
    expect(view.length).toBe('3:00');
    expect(view.lead).toEqual([
      { speaker: 'Me', text: 'Talk to me from the living room camera.', tone: 'variant' },
      { speaker: null, text: 'List devices', tone: 'faint' },
    ]);
    expect(view.rest.map((line) => line.text)).toEqual([
      'Unmute the living room camera',
      'Done, I can hear you there.\nIt may take a second.',
    ]);
    expect(view.rest[1]?.speaker).toBe('Coordinator');
    expect(moreLinesOf(view.rest.length)).toBe('2 more lines');
    expect(moreLinesOf(1)).toBe('1 more line');
  });

  it('marks a failed action in critical with its reason and counts it', () => {
    const turns = [
      { who: 'person' as const, text: 'Lock the door', ok: true, detail: null },
      { who: 'tool' as const, text: 'Lock front door', ok: false, detail: 'Device offline' },
    ];
    const view = callViewOf(callRow('', [{ kind: 'call_transcript', turns }]));
    expect(view.lead[1]).toEqual({
      speaker: null,
      text: 'Lock front door: Device offline',
      tone: 'critical',
    });
    expect(view.rest).toEqual([]);
    expect(view.failures).toBe(1);
    expect(failedActionsOf(view.failures)).toBe('1 action failed');
  });

  it('previews the last spoken line without labels or tools', () => {
    expect(callPreviewOf(callRow(LEGACY))).toBe(
      'Done, I can hear you there. It may take a second.',
    );
    expect(callPreviewOf(callRow('· List devices'))).toBe(callTitleOf(callRow('')));
  });
});
