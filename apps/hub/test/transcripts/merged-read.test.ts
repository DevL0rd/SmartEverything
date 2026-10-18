import type { TranscriptLine } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dbfsOfPcm } from '../../src/transcripts/line-levels';
import { collapseHeard, type HeardLine } from '../../src/transcripts/merged-read';
import { Transcripts } from '../../src/transcripts/transcript-service';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-10-08T10:10:00.000Z';
const BASE = Date.parse(NOW);

function lineAt(
  id: number,
  startSeconds: number,
  endSeconds: number | null,
  text: string,
): TranscriptLine {
  return {
    id,
    session_id: '00000000-0000-4000-8000-000000000000',
    at: new Date(BASE + startSeconds * 1000).toISOString(),
    ended_at: endSeconds === null ? null : new Date(BASE + endSeconds * 1000).toISOString(),
    timing: null,
    speaker_id: null,
    speaker: 'Room',
    text,
    bot: false,
  } satisfies TranscriptLine;
}

function heard(line: TranscriptLine, origin: string, levelDbfs: number | null): HeardLine {
  return { line, origin, levelDbfs };
}

function ids(kept: readonly HeardLine[]): number[] {
  return kept.map((one) => one.line.id);
}

describe('collapseHeard', () => {
  it('keeps the louder of two overlapping lines with the same words from different sources', () => {
    const quiet = heard(lineAt(1, 0, 4, 'Dinner is ready, come eat'), 'camera:a', -30);
    const loud = heard(lineAt(2, 1, 5, 'dinner is ready come eat!'), 'camera:b', -20);
    expect(ids(collapseHeard([quiet, loud]))).toEqual([2]);
    expect(ids(collapseHeard([loud, quiet]))).toEqual([2]);
  });

  it('keeps both when the words differ, the times barely overlap or the source is the same', () => {
    const first = heard(lineAt(1, 0, 4, 'dinner is ready'), 'camera:a', -20);
    expect(
      ids(collapseHeard([first, heard(lineAt(2, 0, 4, 'turn on the lamp'), 'phone:p', -20)])),
    ).toEqual([1, 2]);
    expect(
      ids(collapseHeard([first, heard(lineAt(3, 3.5, 7, 'dinner is ready'), 'phone:p', -20)])),
    ).toEqual([1, 3]);
    expect(
      ids(collapseHeard([first, heard(lineAt(4, 1, 5, 'dinner is ready'), 'camera:a', -20)])),
    ).toEqual([1, 4]);
  });

  it('keeps the earlier line when the levels are unknown or equal', () => {
    const first = heard(lineAt(1, 0, 4, 'good morning everyone'), 'camera:a', null);
    const second = heard(lineAt(2, 0, 4, 'good morning everyone'), 'phone:p', null);
    expect(ids(collapseHeard([first, second]))).toEqual([1]);
    expect(ids(collapseHeard([first, heard(second.line, 'phone:p', -40)]))).toEqual([2]);
  });

  it('matches lines without an end time inside the other line and tolerates one different word', () => {
    const long = heard(
      lineAt(1, 0, 6, 'please close the garage door before you leave'),
      'camera:a',
      -25,
    );
    const point = heard(
      lineAt(2, 3, null, 'please close the garage door before you leave now'),
      'phone:p',
      -15,
    );
    expect(ids(collapseHeard([long, point]))).toEqual([2]);
  });
});

describe('dbfsOfPcm', () => {
  it('reports the root-mean-square level against full scale', () => {
    expect(dbfsOfPcm(new Int16Array(160).fill(3277))).toBeCloseTo(-20, 0);
    expect(dbfsOfPcm(new Int16Array(160))).toBe(-120);
  });
});

describe('Transcripts.search across sources', () => {
  let opened: TestStore;
  let transcripts: Transcripts;

  beforeEach(async () => {
    opened = await testStore();
    transcripts = new Transcripts({
      store: opened.store,
      clock: new FakeClock(NOW),
      log: testLogger('transcripts'),
    });
  });

  afterEach(async () => {
    await opened.close();
  });

  function speak(source: 'camera' | 'phone', sourceId: string, text: string, level?: number): void {
    const session = transcripts.open({
      source,
      sourceId,
      pluginId: null,
      title: sourceId,
      retentionDays: null,
      startedAt: new Date(BASE - 60_000).toISOString(),
    });
    transcripts.add(
      session.id,
      {
        at: new Date(BASE - 10_000).toISOString(),
        ended_at: new Date(BASE - 6_000).toISOString(),
        timing: 'wall_clock',
        speaker_id: null,
        speaker: sourceId,
        text,
        bot: false,
      },
      level,
    );
  }

  it('returns the louder camera or phone line once and keeps each source history whole', () => {
    speak('camera', 'kitchen', 'the oven is hot', -31);
    speak('phone', 'pat-phone', 'the oven is hot', -22);
    const hits = transcripts.search({ words: 'oven', limit: 10 });
    expect(hits.map((hit) => hit.session.source_id)).toEqual(['pat-phone']);
    const kitchen = opened.store.transcripts.list({ source: 'camera', limit: 5 });
    expect(kitchen).toHaveLength(1);
    expect(transcripts.read(kitchen[0]?.id ?? '', 0, 10).lines).toHaveLength(1);
    expect(transcripts.search({ words: 'oven', source: 'camera', limit: 10 })).toHaveLength(1);
  });
});
