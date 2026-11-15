import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PHOTOS_CLIENT_PREFS, type PhotosAiNotice } from '@smarteverything/domain';
import { makeRig, type Answer, type Rig } from './rig';

let rig: Rig;

const BEACH: Answer = {
  caption: 'A dog runs on a beach.',
  scene: 'beach',
  labels: ['dog', 'sand', 'sea'],
  pets: [],
};

const CAKE: Answer = {
  caption: 'A birthday cake with candles.',
  scene: 'birthday party',
  labels: ['cake', 'candles'],
  pets: [],
};

const COUNT = z.strictObject({ total: z.int() });

beforeEach(async () => {
  rig = await makeRig();
});

afterEach(async () => {
  await rig.close();
});

function count(sql: string): number {
  const row = rig.opened.store.database.prepare(sql).get();
  return COUNT.parse(row).total;
}

function chatCalls(): number {
  return rig.sent.filter((call) => call.path.endsWith('/chat/completions')).length;
}

function labelsOf(itemId: string): string {
  const row = rig.opened.store.database
    .prepare('select labels from drive_items_search where item_id = ?')
    .get(itemId);
  return z.strictObject({ labels: z.string() }).parse(row).labels;
}

function setSwitches(
  profileId: string,
  change: { smartSearch?: boolean; faceGrouping?: boolean },
): void {
  rig.ai.setSwitches({ profileId }, change);
}

describe('Smart search consent', () => {
  it('analyses the owner photos by default and meters every call as photos', async () => {
    const id = await rig.photo({ n: 1, root: rig.homeRoot, answer: BEACH });
    rig.ai.start();
    await rig.settle();
    const analysis = rig.opened.store.photoAnalysis.find(id);
    expect(analysis).toMatchObject({
      state: 'done',
      scene: 'beach',
      labels: ['dog', 'sand', 'sea'],
    });
    expect(labelsOf(id)).toBe('beach dog sand sea');
    expect(rig.opened.store.photoEmbeddings.find(id)).toMatchObject({ dims: 512 });
    const spent = rig.opened.store.ledger.totals({
      from: '2026-01-01T00:00:00.000Z',
      to: '2027-01-01T00:00:00.000Z',
      works: ['photos'],
    });
    expect(spent.sum.count).toBe(2);
    expect(spent.sum.cost_micros).toBeGreaterThan(0);
    for (const call of rig.sent) {
      expect(call.body['provider']).toEqual({
        zdr: true,
        data_collection: 'deny',
        allow_fallbacks: false,
      });
    }
  });

  it('sends nothing for a member who has not turned Smart search on, but still groups faces', async () => {
    rig.faces.current = [
      {
        box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
        landmarks: [
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.2 },
          { x: 0.25, y: 0.25 },
          { x: 0.2, y: 0.3 },
          { x: 0.3, y: 0.3 },
        ],
        score: 0.9,
        quality: 0.8,
        embedding: new Float32Array(128).fill(0.1),
      },
    ];
    const id = await rig.photo({ n: 1, root: rig.memberRoot, answer: BEACH });
    rig.ai.start();
    await rig.settle();
    expect(rig.sent).toEqual([]);
    expect(rig.opened.store.photoAnalysis.find(id)).toBeUndefined();
    expect(rig.opened.store.photoFaces.forItem(id)).toHaveLength(1);
    expect(rig.opened.store.photoFaces.forItem(id)[0]).toMatchObject({ kind: 'person', rev: 1 });
  });

  it('starts analysing a member photos once they turn Smart search on', async () => {
    const id = await rig.photo({ n: 1, root: rig.memberRoot, answer: BEACH });
    rig.ai.start();
    await rig.settle();
    expect(rig.sent).toEqual([]);
    setSwitches(rig.member, { smartSearch: true });
    await rig.settle();
    expect(rig.opened.store.photoAnalysis.find(id)?.state).toBe('done');
    expect(chatCalls()).toBe(1);
  });

  it('deletes results and forgets the index when a person turns Smart search off, and redoes them when it is turned on again', async () => {
    const id = await rig.photo({ n: 1, root: rig.homeRoot, answer: BEACH });
    rig.ai.start();
    await rig.settle();
    expect(rig.ai.index.size()).toBe(1);
    setSwitches(rig.owner, { smartSearch: false });
    await rig.settle();
    expect(rig.opened.store.photoAnalysis.find(id)).toBeUndefined();
    expect(rig.opened.store.photoEmbeddings.find(id)).toBeUndefined();
    expect(labelsOf(id)).toBe('');
    expect(rig.ai.index.size()).toBe(0);
    expect(count("select count(*) as total from drive_media_jobs where kind = 'vision'")).toBe(0);
    const calls = chatCalls();
    setSwitches(rig.owner, { smartSearch: true });
    await rig.settle();
    expect(chatCalls()).toBe(calls + 1);
    expect(rig.opened.store.photoAnalysis.find(id)?.state).toBe('done');
  });

  it('deletes the detections and groups when Face grouping is turned off', async () => {
    rig.faces.current = [
      {
        box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
        landmarks: [
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.2 },
          { x: 0.25, y: 0.25 },
          { x: 0.2, y: 0.3 },
          { x: 0.3, y: 0.3 },
        ],
        score: 0.9,
        quality: 0.8,
        embedding: new Float32Array(128).fill(0.1),
      },
    ];
    const id = await rig.photo({ n: 1, root: rig.memberRoot });
    rig.ai.start();
    await rig.settle();
    expect(rig.opened.store.photoFaces.forItem(id)).toHaveLength(1);
    const group = rig.opened.store.photoGroups.insert({
      id: 'group-1',
      profileId: rig.member,
      kind: 'person',
      species: null,
      name: 'Mum',
      coverFaceId: null,
    });
    setSwitches(rig.member, { faceGrouping: false });
    await rig.settle();
    expect(rig.opened.store.photoFaces.forItem(id)).toEqual([]);
    expect(rig.opened.store.photoGroups.find(group.id)).toBeUndefined();
  });

  it('never analyses a locked item or a file outside the Photos library', async () => {
    await rig.photo({ n: 1, root: rig.memberRoot, relPath: '.locked/1.jpg', answer: BEACH });
    await rig.photo({ n: 2, root: rig.memberRoot, relPath: 'Documents/scan.jpg', answer: BEACH });
    setSwitches(rig.member, { smartSearch: true });
    rig.ai.start();
    await rig.settle();
    expect(rig.sent).toEqual([]);
  });
});

describe('the Photos analysis jobs', () => {
  it('queues one job per kind and revision and runs a new revision again', async () => {
    const id = await rig.photo({ n: 1, root: rig.homeRoot, answer: BEACH });
    rig.ai.start();
    await rig.settle();
    expect(chatCalls()).toBe(1);
    rig.ai.scheduler.reconcile();
    await rig.settle();
    expect(chatCalls()).toBe(1);
    const jobs = rig.opened.store.database
      .prepare('select kind, rev from drive_media_jobs where item_id = ? order by kind')
      .all(id);
    expect(jobs.map((job) => `${String(job['kind'])}@${String(job['rev'])}`)).toEqual([
      'embed@1',
      'faces@1',
      'vision@1',
    ]);
    rig.opened.store.database.prepare('update drive_items set rev = 2 where id = ?').run(id);
    const { writePreview } = await import('./rig');
    await writePreview(rig, id, 2, '#223344');
    rig.opened.store.feed.notice({
      type: 'drive_changed',
      rootIds: [rig.homeRoot],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 1,
    });
    rig.answers.set(id, CAKE);
    await rig.settle();
    expect(rig.opened.store.photoAnalysis.find(id)).toMatchObject({ rev: 2 });
  });

  it('keeps the vision answer pending without a key and resumes when a key appears', async () => {
    rig.keyState.key = null;
    const id = await rig.photo({ n: 1, root: rig.homeRoot, answer: BEACH });
    rig.ai.start();
    await rig.settle();
    expect(rig.sent).toEqual([]);
    expect(rig.opened.store.photoAnalysis.find(id)?.state).toBe('needs_key');
    const waiting = rig.ai.statusOf({ profileId: rig.owner });
    expect(waiting.hasKey).toBe(false);
    expect(waiting.tags).toMatchObject({ needsKey: 1, done: 0 });
    rig.keyState.key = 'sk-new';
    for (const listener of rig.keyState.listeners) listener();
    await rig.settle();
    expect(rig.opened.store.photoAnalysis.find(id)?.state).toBe('done');
    expect(rig.opened.store.photoEmbeddings.find(id)).toBeDefined();
  });

  it('records a failed analysis with its reason', async () => {
    const id = await rig.photo({ n: 1, root: rig.homeRoot });
    rig.ai.start();
    await rig.settle();
    expect(rig.opened.store.photoAnalysis.find(id)?.state).toBe('failed');
    expect(rig.ai.statusOf({ profileId: rig.owner }).tags.failed).toBe(1);
  });

  it('runs only the failed analyses again on a retry, for the photos the caller sees', async () => {
    const home = await rig.photo({ n: 1, root: rig.homeRoot });
    const own = await rig.photo({ n: 2, root: rig.memberRoot, colour: '#443322' });
    const fine = await rig.photo({ n: 3, root: rig.homeRoot, colour: '#225511', answer: CAKE });
    setSwitches(rig.member, { smartSearch: true });
    rig.ai.start();
    await rig.settle();
    expect(rig.ai.statusOf({ profileId: rig.owner }).tags.failed).toBe(2);
    rig.answers.set(home, BEACH);
    rig.answers.set(own, BEACH);
    const calls = chatCalls();
    const member = rig.ai.retryFailed({ profileId: rig.member });
    expect(member.tags.queued).toBe(1);
    await rig.settle();
    expect(chatCalls()).toBe(calls + 1);
    expect(rig.opened.store.photoAnalysis.find(own)?.state).toBe('done');
    expect(rig.opened.store.photoAnalysis.find(home)?.state).toBe('failed');
    rig.ai.retryFailed({ profileId: rig.owner });
    await rig.settle();
    expect(chatCalls()).toBe(calls + 2);
    expect(rig.opened.store.photoAnalysis.find(home)?.state).toBe('done');
    expect(rig.opened.store.photoAnalysis.find(fine)?.state).toBe('done');
    expect(rig.ai.statusOf({ profileId: rig.owner }).tags.failed).toBe(0);
  });

  it('retries nothing for a person whose Smart search is off', async () => {
    await rig.photo({ n: 1, root: rig.memberRoot });
    setSwitches(rig.member, { smartSearch: true });
    rig.ai.start();
    await rig.settle();
    setSwitches(rig.member, { smartSearch: false });
    await rig.settle();
    const calls = rig.sent.length;
    rig.ai.retryFailed({ profileId: rig.member });
    await rig.settle();
    expect(rig.sent).toHaveLength(calls);
  });

  it('announces progress for the faces, tags and index stages', async () => {
    const notices: PhotosAiNotice[] = [];
    rig.opened.store.feed.subscribeNotices((notice) => {
      if (notice.type === 'photos_ai') notices.push(notice);
    });
    await rig.photo({ n: 1, root: rig.homeRoot, answer: BEACH });
    rig.ai.start();
    await rig.settle();
    expect(new Set(notices.map((notice) => notice.stage))).toEqual(
      new Set(['faces', 'tags', 'index']),
    );
    for (const stage of ['faces', 'tags', 'index'] as const) {
      const last = notices.findLast((notice) => notice.stage === stage);
      expect(last).toMatchObject({ done: 1, total: 1 });
    }
  });

  it('embeds each pet crop with the pet model and stores a vector per pet', async () => {
    const id = await rig.photo({
      n: 1,
      root: rig.homeRoot,
      answer: { ...BEACH, pets: [{ species: 'Dog', box: [100, 200, 600, 700] }] },
    });
    rig.ai.start();
    await rig.settle();
    const pets = rig.opened.store.photoFaces.forItem(id);
    expect(pets).toHaveLength(1);
    expect(pets[0]).toMatchObject({
      kind: 'pet',
      species: 'dog',
      model: 'google/gemini-embedding-2',
      box: { x: 0.2, y: 0.1, w: 0.5, h: 0.5 },
    });
    expect(pets[0]?.vector.byteLength).toBe(512 * 4);
    const petCall = rig.sent.find((call) =>
      JSON.stringify(call.body).includes('gemini-embedding-2'),
    );
    expect(JSON.stringify(petCall?.body)).toContain('data:image/jpeg;base64,');
  });
});

describe('meaning search', () => {
  it('ranks the photo that matches the words first and ignores other models', async () => {
    const beach = await rig.photo({ n: 1, root: rig.homeRoot, colour: '#112233', answer: BEACH });
    const cake = await rig.photo({ n: 2, root: rig.homeRoot, colour: '#443322', answer: CAKE });
    rig.ai.start();
    await rig.settle();
    const hits = await rig.ai.meaning({ profileId: rig.owner }, 'dog on the beach', 0.1);
    expect(hits[0]?.itemId).toBe(beach);
    expect(hits.map((hit) => hit.itemId)).not.toContain(cake);
    rig.ai.models.update({ embedding: 'other/embedding' });
    expect(await rig.ai.meaning({ profileId: rig.owner }, 'dog on the beach', 0.1)).toEqual([]);
  });

  it('returns nothing and sends nothing for a person without Smart search', async () => {
    await rig.photo({ n: 1, root: rig.homeRoot, answer: BEACH });
    rig.ai.start();
    await rig.settle();
    const calls = rig.sent.length;
    expect(await rig.ai.meaning({ profileId: rig.member }, 'dog', 0)).toEqual([]);
    expect(rig.sent).toHaveLength(calls);
  });
});

describe('Smart features status and models', () => {
  it('counts the stages, the spend and the estimate for a person, and the whole home for the owner', async () => {
    await rig.photo({ n: 1, root: rig.homeRoot, colour: '#112233', answer: BEACH });
    await rig.photo({ n: 2, root: rig.memberRoot, colour: '#443322', answer: CAKE });
    rig.ai.start();
    await rig.settle();
    const owner = rig.ai.statusOf({ profileId: rig.owner });
    expect(owner).toMatchObject({ smartSearch: true, hasKey: true, total: 2 });
    expect(owner.tags.done).toBe(1);
    expect(owner.index.done).toBe(1);
    expect(owner.spentMicros).toBeGreaterThan(0);
    const member = rig.ai.statusOf({ profileId: rig.member });
    expect(member).toMatchObject({ smartSearch: false, total: 1, spentMicros: 0 });
    expect(member.tags.done).toBe(0);
    expect(member.estimateMicros).toBe(0);
    expect(owner.estimateMicros).toBe(0);
  });

  it('applies a changed model to new photos only and redoes the rest on a confirmed re-analysis', async () => {
    const id = await rig.photo({ n: 1, root: rig.homeRoot, answer: BEACH });
    rig.ai.start();
    await rig.settle();
    rig.ai.models.update({ vision: 'qwen/qwen3-vl-8b-instruct' });
    rig.ai.scheduler.reconcile();
    await rig.settle();
    expect(chatCalls()).toBe(1);
    const estimate = rig.ai.statusOf({ profileId: rig.owner }).estimateMicros;
    expect(estimate).toBeGreaterThan(0);
    expect(() => rig.ai.reanalyse(estimate + 1)).toThrow(/estimate changed/u);
    expect(rig.ai.reanalyse(estimate)).toEqual({ queued: 1, estimateMicros: estimate });
    await rig.settle();
    expect(chatCalls()).toBe(2);
    expect(rig.opened.store.photoAnalysis.find(id)?.model).toBe('qwen/qwen3-vl-8b-instruct');
    expect(rig.ai.statusOf({ profileId: rig.owner }).estimateMicros).toBe(0);
  });

  it('stores the Smart switches in the Photos preferences of the person', () => {
    rig.ai.setSwitches({ profileId: rig.member }, { smartSearch: true });
    const read = rig.opened.store.personal.pref(PHOTOS_CLIENT_PREFS.photos, {
      clientId: rig.member,
      profileId: rig.member,
    });
    expect(read).toMatchObject({
      status: 'stored',
      value: { smartSearch: true, faceGrouping: true },
    });
  });
});

describe('the analysis of one photo', () => {
  it('shows a person only the analysis of photos they can open', async () => {
    const mine = await rig.photo({ n: 1, root: rig.homeRoot, answer: BEACH });
    const theirs = await rig.photo({ n: 2, root: rig.memberRoot, colour: '#556677', answer: CAKE });
    setSwitches(rig.member, { smartSearch: true });
    rig.ai.start();
    await rig.settle();
    expect(rig.ai.analysisOf({ profileId: rig.owner }, mine)).toMatchObject({
      state: 'done',
      scene: 'beach',
      text: null,
    });
    expect(() => rig.ai.analysisOf({ profileId: rig.owner }, theirs)).toThrow(
      /not in your Photos/u,
    );
    expect(rig.ai.analysisOf({ profileId: rig.member }, theirs)).toMatchObject({ state: 'done' });
  });

  it('says skipped for a photo nobody analysed', async () => {
    const id = await rig.photo({ n: 1, root: rig.memberRoot });
    expect(rig.ai.analysisOf({ profileId: rig.member }, id)).toMatchObject({
      state: 'skipped',
      caption: null,
    });
  });
});
