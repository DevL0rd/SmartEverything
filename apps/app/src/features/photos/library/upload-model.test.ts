import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import type { UploadEntry } from '../../drive';
import {
  ALREADY_THERE,
  destinationText,
  entryStatus,
  panelSummary,
  percentText,
  RENAMED,
} from './upload-model';

const ITEM = '00000000-0000-4000-8000-0000000000a1';

function entry(extra: Partial<UploadEntry>): UploadEntry {
  return {
    id: 'u1',
    name: 'IMG_4821.HEIC',
    size: 1000,
    sent: 0,
    state: 'uploading',
    outcome: null,
    ...extra,
  };
}

describe('upload rows', () => {
  it('shows progress while sending and Paused when held', () => {
    expect(entryStatus(entry({ sent: 640 }))).toEqual({
      kind: 'progress',
      share: 0.64,
      paused: false,
    });
    expect(entryStatus(entry({ sent: 0, size: 0, state: 'paused' }))).toEqual({
      kind: 'progress',
      share: 0,
      paused: true,
    });
    expect(percentText(0.64)).toBe('64 %');
  });

  it('says Already in library, Renamed and why a file failed', () => {
    expect(
      entryStatus(entry({ state: 'settled', outcome: { kind: 'already-have', itemId: ITEM } })),
    ).toEqual({ kind: 'note', text: ALREADY_THERE, critical: false });
    expect(
      entryStatus(
        entry({
          state: 'settled',
          outcome: { kind: 'done', itemId: ITEM, name: 'Garden (2).jpg', renamed: true },
        }),
      ),
    ).toEqual({ kind: 'done', text: RENAMED });
    expect(
      entryStatus(
        entry({ state: 'settled', outcome: { kind: 'failed', failure: { kind: 'no-space' } } }),
      ),
    ).toEqual({ kind: 'note', text: 'The hub is out of space', critical: true });
  });
});

describe('upload panel', () => {
  it('counts finished files and the bytes left while running', () => {
    const summary = panelSummary([
      entry({
        id: 'a',
        state: 'settled',
        sent: 1000,
        outcome: { kind: 'already-have', itemId: ITEM },
      }),
      entry({ id: 'b', sent: 400 }),
      entry({ id: 'c', sent: 0 }),
    ]);
    expect(summary.title).toBe('Uploading 1 of 3');
    expect(summary.detail).toBe(`${bytes(1600)} left · resumes if the app closes`);
    expect(summary.running).toBe(true);
    expect(summary.paused).toBe(false);
  });

  it('is paused only when every open file is', () => {
    const summary = panelSummary([entry({ id: 'a', state: 'paused' })]);
    expect(summary.title).toBe('Paused 0 of 1');
    expect(summary.paused).toBe(true);
  });

  it('settles into a done or failed title', () => {
    const done = entry({
      state: 'settled',
      outcome: { kind: 'done', itemId: ITEM, name: 'a', renamed: false },
    });
    expect(panelSummary([done]).title).toBe('Uploaded 1');
    const failed = entry({ id: 'f', state: 'settled', outcome: { kind: 'cancelled' } });
    expect(panelSummary([done, failed]).running).toBe(false);
    const broken = entry({
      id: 'x',
      state: 'settled',
      outcome: { kind: 'failed', failure: { kind: 'over-quota' } },
    });
    expect(panelSummary([done, broken]).title).toBe('1 did not upload');
  });

  it('names the Uploads folder once the hub said where it is', () => {
    expect(destinationText('Uploads/Alex')).toBe('Goes to Uploads/Alex in the library folder.');
    expect(destinationText(null)).toBe('Goes to your Uploads folder in the library folder.');
  });
});
