import { describe, expect, it } from 'vitest';
import { percent } from '../../../format/number';
import type { PickedBlob } from '../../../platform/pick-files';
import type { UploadHandle, UploadTransport } from '../source/types';
import {
  allChoicesOf,
  choicesOf,
  conflictLineOf,
  conflictsOf,
  decideAll,
  itemStateTextOf,
  sheetLineOf,
} from './conflict-model';
import { headActionOf, retryBodyOf, rowEndOf } from './strip-model';
import { UploadQueue, type UploadItem } from './upload-queue';
import { summaryOf } from './upload-summary';

const HOME = { place: '/home/dana', folder: null };

function file(name: string): PickedBlob {
  return {
    name,
    mime: 'text/plain',
    bytes: 10,
    preview: null,
    data: () => Promise.resolve(new ArrayBuffer(10)),
    blob: () => Promise.resolve(new Blob([new Uint8Array(10)])),
  };
}

const pending: UploadHandle = {
  outcome: new Promise(() => undefined),
  pause: () => Promise.resolve(),
  resume: () => undefined,
  cancel: () => Promise.resolve(),
};

function queueOf(): UploadQueue {
  const transport: UploadTransport = { conflicts: 'ask', serial: false, start: () => pending };
  return new UploadQueue(transport, () => undefined);
}

function item(change: Partial<UploadItem>): UploadItem {
  return {
    id: '1',
    file: file('a.txt'),
    folder: HOME,
    folderKey: HOME.place,
    name: 'a.txt',
    replace: false,
    state: 'waiting',
    sent: 0,
    size: 10,
    storedAs: null,
    error: null,
    retryable: false,
    ...change,
  };
}

describe('conflict choices', () => {
  it('offers replace, keep both and skip only for a name clash', () => {
    expect(choicesOf(item({ state: 'conflict' })).map((spec) => spec.choice)).toEqual([
      'replace',
      'both',
      'skip',
    ]);
    expect(choicesOf(item({ state: 'sending' }))).toEqual([]);
    expect(conflictLineOf(item({ state: 'conflict' }), 'Home')).toBe('a.txt is already in Home');
    expect(conflictLineOf(item({}), 'Home')).toBeNull();
  });

  it('offers choices for all only when two or more names clash', () => {
    expect(allChoicesOf([item({ state: 'conflict' })])).toEqual([]);
    const two = [item({ state: 'conflict' }), item({ id: '2', state: 'conflict' })];
    expect(allChoicesOf(two).map((spec) => spec.label)).toEqual([
      'Replace all 2',
      'Keep both all 2',
      'Skip all 2',
    ]);
  });

  it('decides every clash in the queue at once', () => {
    const queue = queueOf();
    queue.add([file('a.txt'), file('b.txt'), file('c.txt')], HOME, new Set(['a.txt', 'b.txt']));
    expect(conflictsOf(queue.items.get())).toHaveLength(2);
    decideAll(queue, queue.items.get(), 'both');
    const names = queue.items.get().map((entry) => [entry.name, entry.state]);
    expect(names).toEqual([
      ['a (2).txt', 'sending'],
      ['b (2).txt', 'sending'],
      ['c.txt', 'sending'],
    ]);
  });

  it('describes each state for the sheet', () => {
    expect(itemStateTextOf(item({ state: 'sending', sent: 5 }))).toBe(percent(0.5));
    expect(itemStateTextOf(item({ state: 'done', storedAs: 'a (2).txt' }))).toBe(
      'Done · named a (2).txt',
    );
    expect(itemStateTextOf(item({ state: 'failed', error: 'Disk full' }))).toBe('Disk full');
    expect(sheetLineOf([], 'Home', 'this phone')).toBe(
      'Choose files on this phone to send to Home.',
    );
    expect(sheetLineOf([item({ state: 'conflict' })], 'Home', 'this phone')).toBe(
      '1 name already in Home. Choose what happens to each.',
    );
    expect(sheetLineOf([item({}), item({ id: '2' })], 'Home', 'this phone')).toBe(
      '2 files left, going to Home',
    );
  });
});

describe('upload strip controls', () => {
  it('offers pause and resume only when the source resumes uploads', () => {
    const sending = summaryOf([item({ state: 'sending' })]);
    expect(headActionOf(sending, true)).toBe('pause');
    expect(headActionOf(sending, false)).toBeNull();
    expect(headActionOf(summaryOf([item({ state: 'paused' })]), true)).toBe('resume');
    expect(headActionOf(summaryOf([item({ state: 'done' })]), false)).toBe('close');
    expect(rowEndOf(item({ state: 'sending' }), false)).toEqual({
      kind: 'controls',
      pausable: false,
    });
    expect(rowEndOf(item({ state: 'failed', retryable: true }), true)).toEqual({
      kind: 'failed',
      retryable: true,
    });
    expect(retryBodyOf(true)).toContain('pick up where they stopped');
    expect(retryBodyOf(false)).toContain('start again');
  });
});
