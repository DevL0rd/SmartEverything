import { describe, expect, it } from 'vitest';
import type { ListeningSource, WakeArbitrated } from '@smarteverything/domain';
import { contestOf } from './contest-model';

const AT = '2026-10-18T09:00:00.000Z';

function named(key: string, kind: ListeningSource['kind'], name: string): ListeningSource {
  return {
    key,
    kind,
    name,
    profileId: null,
    wake: true,
    transcribe: false,
    state: 'listening',
    writing: { state: 'off' },
    sensitivity: null,
    changeable: true,
    claims: [],
  };
}

const SOURCES = [
  named('hall', 'camera', 'Hallway camera'),
  named('kitchen', 'camera', 'Kitchen camera'),
  named('fam', 'walkie', 'Family'),
];

function arbitrated(
  decidedBy: WakeArbitrated['decidedBy'],
  claims: WakeArbitrated['claims'],
): WakeArbitrated {
  const winner = claims.find((claim) => claim.outcome === 'won') ?? claims[0];
  if (winner === undefined) throw new Error('A contest needs a claim');
  return { at: AT, winner, decidedBy, claims };
}

describe('contestOf', () => {
  it('names the loudest source and counts the others', () => {
    const model = contestOf(
      arbitrated('loudest', [
        { source: 'camera', key: 'hall', snippetDbfs: -21, afterMs: 0, outcome: 'won' },
        { source: 'camera', key: 'kitchen', snippetDbfs: -26, afterMs: 210, outcome: 'stood_down' },
      ]),
      SOURCES,
    );
    expect(model?.title).toBe('Hallway camera answered');
    expect(model?.summary).toBe('Loudest at −21 dB. One other source heard it.');
    expect(model?.lines.map((line) => line.outcome)).toEqual(['answered', 'stood_down']);
  });

  it('says the louder source took over even after the greeting began', () => {
    const model = contestOf(
      arbitrated('loudest', [
        { source: 'camera', key: 'kitchen', snippetDbfs: -31, afterMs: 0, outcome: 'superseded' },
        { source: 'camera', key: 'hall', snippetDbfs: -20, afterMs: 640, outcome: 'won' },
      ]),
      SOURCES,
    );
    expect(model?.title).toBe('Hallway camera took over');
    expect(model?.summary).toBe('Louder than Kitchen camera, even after its greeting had begun.');
    expect(model?.lines.map((line) => line.outcome)).toEqual(['handed_over', 'took_over']);
  });

  it('calls a refused claim after the one second window late', () => {
    const model = contestOf(
      arbitrated('loudest', [
        { source: 'camera', key: 'hall', snippetDbfs: -21, afterMs: 0, outcome: 'won' },
        {
          source: 'camera',
          key: 'kitchen',
          snippetDbfs: -19,
          afterMs: 1700,
          outcome: 'stood_down',
        },
      ]),
      SOURCES,
    );
    expect(model?.lines[1]?.outcome).toBe('late');
    expect(model?.axisMs).toBe(2000);
  });

  it('widens the axis when a claim arrives after two seconds', () => {
    const model = contestOf(
      arbitrated('loudest', [
        { source: 'camera', key: 'hall', snippetDbfs: -21, afterMs: 0, outcome: 'won' },
        {
          source: 'camera',
          key: 'kitchen',
          snippetDbfs: -30,
          afterMs: 2600,
          outcome: 'stood_down',
        },
      ]),
      SOURCES,
    );
    expect(model?.axisMs).toBe(3000);
  });

  it('marks a Discord win as priority whatever the volume', () => {
    const model = contestOf(
      arbitrated('discord', [
        { source: 'camera', key: 'hall', snippetDbfs: -19, afterMs: 0, outcome: 'superseded' },
        { source: 'voice_call', key: 'person', snippetDbfs: -34, afterMs: 460, outcome: 'won' },
      ]),
      SOURCES,
    );
    expect(model?.title).toBe('Discord call answered');
    expect(model?.badge).toBe('Priority');
  });

  it('marks a walkie win and names the channel', () => {
    const model = contestOf(
      arbitrated('walkie', [
        { source: 'camera', key: 'hall', snippetDbfs: -22, afterMs: 0, outcome: 'superseded' },
        { source: 'talk', key: 'fam', snippetDbfs: -33, afterMs: 120, outcome: 'won' },
      ]),
      SOURCES,
    );
    expect(model?.badge).toBe('Walkie first');
    expect(model?.lines[1]?.name).toBe('Walkie · Family');
  });

  it('does not reveal a source the viewer cannot see', () => {
    const model = contestOf(
      arbitrated('only', [
        { source: 'camera', key: 'secret', snippetDbfs: -24, afterMs: 0, outcome: 'won' },
      ]),
      [],
    );
    expect(model?.title).toBe('A camera answered');
    expect(model?.summary).toBe('Only one source heard it, at −24 dB.');
  });
});
