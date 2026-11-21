import { testStore, type TestStore, type SeededStore } from '../support/store';
import { randomUUID } from 'node:crypto';
import { type ClientRow, type EndpointName, type ProfileRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { DRIVE_EDIT } from '../../src/extensions/mcp/tools/drive-edits';
import { DRIVE_READ } from '../../src/extensions/mcp/tools/drive-reads';
import { operatingContext, selected, type Answers, type Call } from './mcp-rig';
import { captureLogs } from '../support/logs';

const ITEM = randomUUID();
const ALBUM = randomUUID();

const GROUP = randomUUID();
const OTHER_GROUP = randomUUID();
const PROFILE = randomUUID();
const FACE = randomUUID();

function callsOf(): [EndpointName, unknown][] {
  return calls.map((call) => [call.name, call.body]);
}

let opened: TestStore;
let calls: Call[];
let answers: Answers;
let owner: ClientRow;
let ownerProfile: ProfileRow;
let context: OperatingContext;

function operating(client: ClientRow, profile: ProfileRow): OperatingContext {
  return operatingContext(
    {
      store: (): SeededStore => opened.store,
      record: (call): void => {
        calls.push(call);
      },
      answers: (): Answers => answers,
    },
    client,
    profile,
  );
}

function read(view: string, fields: Record<string, unknown> = {}): unknown {
  return selected(DRIVE_READ, view).run(context, fields, {});
}

function edit(action: string, fields: Record<string, unknown> = {}): unknown {
  return selected(DRIVE_EDIT, action).run(context, fields, {});
}

function onlyCall(): Call {
  expect(calls).toHaveLength(1);
  const [only] = calls;
  if (only === undefined) throw new Error('no call');
  return only;
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  calls = [];
  answers = {};
  ownerProfile = opened.store.profiles.first();
  owner = opened.store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  context = operating(owner, ownerProfile);
});

afterEach(async () => {
  await opened.close();
});

describe('Photos people, search and smart reads', () => {
  it('lists people and pets, filtered by kind', async () => {
    await read('people');
    await read('people', { groupKind: 'pet' });
    expect(calls.map((call) => [call.name, call.query])).toEqual([
      ['listPhotoGroups', {}],
      ['listPhotoGroups', { kind: 'pet' }],
    ]);
  });

  it('reads one person with their months, then a month of their photos', async () => {
    answers.readPhotoGroup = (): unknown => ({ id: GROUP });
    answers.readLibraryBuckets = (): unknown => [{ month: '2026-07', count: 3 }];
    expect(await read('person', { groupId: GROUP })).toEqual({
      group: { id: GROUP },
      months: [{ month: '2026-07', count: 3 }],
    });
    calls.length = 0;
    await read('person', { groupId: GROUP, month: '2026-07', cursor: 'c2' });
    expect(onlyCall()).toMatchObject({
      name: 'readLibraryPage',
      params: { month: '2026-07' },
      query: { filter: 'all', groupIds: GROUP, cursor: 'c2' },
    });
  });

  it('reads the faces of a photo together with what was found in it', async () => {
    answers.readPhotoFaces = (): unknown => ({ itemId: ITEM, faces: [] });
    answers.readPhotoAnalysis = (): unknown => ({ itemId: ITEM, state: 'skipped' });
    expect(await read('item_faces', { itemId: ITEM })).toEqual({
      faces: { itemId: ITEM, faces: [] },
      analysis: { itemId: ITEM, state: 'skipped' },
    });
    expect(calls.map((call) => call.name)).toEqual(['readPhotoFaces', 'readPhotoAnalysis']);
  });

  it.each([
    ['sharing', 'readPhotoSharing'],
    ['smart_status', 'readPhotoAiStatus'],
  ] as const)('reads view %s through %s', async (view, name) => {
    await read(view);
    expect(onlyCall().name).toBe(name);
  });

  it('pages the activity of an album', async () => {
    await read('album_activity', { albumId: ALBUM, cursor: 'c1' });
    expect(onlyCall()).toMatchObject({
      name: 'listPhotoAlbumActivity',
      params: { albumId: ALBUM },
      query: { cursor: 'c1' },
    });
  });

  it('narrows the library by people, things, text in the photo and meaning', async () => {
    await read('library', {
      groupIds: [GROUP, OTHER_GROUP],
      labels: ['dog', 'beach'],
      photoText: 'invoice',
      meaning: 'a birthday cake',
    });
    expect(onlyCall().query).toEqual({
      filter: 'all',
      groupIds: `${GROUP},${OTHER_GROUP}`,
      labels: 'dog,beach',
      photoText: 'invoice',
      meaning: 'a birthday cake',
    });
  });

  it('reads the archive by month and rejects a label with a comma', async () => {
    await read('archive');
    await read('archive', { month: '2026-07', libraryFilter: 'videos' });
    expect(calls.map((call) => [call.name, call.params, call.query])).toEqual([
      ['readArchiveBuckets', {}, { filter: 'all' }],
      ['readArchivePage', { month: '2026-07' }, { filter: 'videos' }],
    ]);
    expect(selected(DRIVE_READ, 'library').issues({ labels: ['a,b'] })).not.toBeNull();
  });

  it('offers no way to read or unlock the Locked folder', () => {
    expect(Object.keys(DRIVE_READ.selections).filter((view) => /lock/i.test(view))).toEqual([]);
    expect(Object.keys(DRIVE_EDIT.selections).filter((action) => /lock/i.test(action))).toEqual([
      'lock_set',
      'locked_move_in',
    ]);
  });
});

describe('Photos people and smart edits', () => {
  it('names, links and hides a person, and merges and corrects groups', async () => {
    await edit('person_update', { groupId: GROUP, personName: 'Sam', linkedProfileId: PROFILE });
    await edit('person_update', { groupId: GROUP, personName: null, hidden: true });
    await edit('person_merge', { groupId: GROUP, sourceGroupIds: [OTHER_GROUP] });
    await edit('person_remove_faces', { groupId: GROUP, faceIds: [FACE] });
    expect(calls.map((call) => [call.name, call.params, call.body])).toEqual([
      ['updatePhotoGroup', { groupId: GROUP }, { name: 'Sam', linkedProfileId: PROFILE }],
      ['updatePhotoGroup', { groupId: GROUP }, { name: null, hidden: true }],
      ['mergePhotoGroups', {}, { targetId: GROUP, sourceIds: [OTHER_GROUP] }],
      ['removePhotoGroupFaces', { groupId: GROUP }, { faceIds: [FACE] }],
    ]);
    expect(selected(DRIVE_EDIT, 'person_update').issues({ groupId: GROUP })).not.toBeNull();
  });

  it('turns Smart features on and off and re-analyses with the estimate', async () => {
    await edit('smart_settings', { smartSearch: true });
    await edit('smart_reanalyse', { estimateMicros: 1200, everything: true });
    expect(callsOf()).toEqual([
      ['setPhotoAiSettings', { smartSearch: true }],
      ['reanalysePhotos', { estimateMicros: 1200, everything: true }],
    ]);
    expect(selected(DRIVE_EDIT, 'smart_settings').issues({})).not.toBeNull();
    expect(selected(DRIVE_EDIT, 'smart_reanalyse').issues({ estimateMicros: 1200 })).not.toBeNull();
  });
});

describe('Photos edit state, edit jobs, models and retries', () => {
  it('reads the edit state of a photo and the progress of an edit job', async () => {
    const JOB = randomUUID();
    await read('photo_edit_state', { itemId: ITEM });
    await read('photo_edit_job', { jobId: JOB });
    expect(calls.map((call) => [call.name, call.params])).toEqual([
      ['readPhotoEdit', { itemId: ITEM }],
      ['readPhotoEditJob', { jobId: JOB }],
    ]);
    expect(selected(DRIVE_READ, 'photo_edit_job').issues({ jobId: 'x' })).not.toBeNull();
  });

  it('lists the models Smart features can use and retries failed analysis', async () => {
    await read('smart_models');
    await edit('smart_retry_failed');
    expect(calls.map((call) => call.name)).toEqual(['listPhotoAiModels', 'retryFailedPhotoAi']);
  });

  it('says two groups are not the same person', async () => {
    await edit('person_dismiss_merge', { groupId: GROUP, otherGroupId: randomUUID() });
    expect(onlyCall()).toMatchObject({ name: 'dismissPhotoMergeSuggestion' });
    expect(selected(DRIVE_EDIT, 'person_dismiss_merge').issues({ groupId: GROUP })).not.toBeNull();
  });
});
