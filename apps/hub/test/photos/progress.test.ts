import type { CommittedNotice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { announcePhotosProgress } from '../../src/photos/progress';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const ITEM = '0f000000-0000-4000-8000-000000000001';

let opened: TestStore;
let heard: CommittedNotice[] = [];

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  heard = [];
  opened.store.feed.subscribeNotices((notice) => {
    heard.push(notice);
  });
});

afterEach(async () => {
  await opened.close();
});

describe('the photos progress emitter', () => {
  it('announces a preview with its item', () => {
    announcePhotosProgress(opened.store.feed, { kind: 'preview', itemId: ITEM, done: 1, total: 4 });
    expect(heard).toStrictEqual([
      { type: 'photos_progress', kind: 'preview', itemId: ITEM, done: 1, total: 4 },
    ]);
  });

  it('announces a landed playable copy as done equal to total', () => {
    announcePhotosProgress(opened.store.feed, {
      kind: 'playable',
      itemId: ITEM,
      done: 1,
      total: 1,
    });
    expect(heard).toStrictEqual([
      { type: 'photos_progress', kind: 'playable', itemId: ITEM, done: 1, total: 1 },
    ]);
  });

  it('announces backup progress for a phone with no item', () => {
    announcePhotosProgress(opened.store.feed, {
      kind: 'backup',
      deviceId: 'phone-1',
      done: 10,
      total: 30,
    });
    expect(heard).toStrictEqual([
      { type: 'photos_progress', kind: 'backup', deviceId: 'phone-1', done: 10, total: 30 },
    ]);
  });

  it('refuses progress that passes its total and announces nothing', () => {
    expect(() => {
      announcePhotosProgress(opened.store.feed, { kind: 'poster', done: 5, total: 4 });
    }).toThrow();
    expect(heard).toStrictEqual([]);
  });
});
