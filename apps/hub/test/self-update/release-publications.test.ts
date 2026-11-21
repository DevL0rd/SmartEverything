import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReleaseSource } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReleasePublications } from '../../src/self-update/release-publications';
import { ReleaseQueue, type QueuePorts } from '../../src/self-update/release-queue';
import { RevisionRecord } from '../../src/self-update/revision-record';

const TIP = 'a'.repeat(40);

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'release-publications-'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('release publications', () => {
  it('finishes a waiting revision when the provided publish is announced', async () => {
    const record = new RevisionRecord(join(scratch, 'revisions.json'));
    const ports: QueuePorts = {
      record,
      now: (): Date => new Date('2026-11-14T10:00:00.000Z'),
      newId: (): string => '00000000-0000-4000-8000-000000000001',
      sourceOf: (): Promise<ReleaseSource> => Promise.resolve('provided'),
      prepare: () => Promise.resolve({ base: null, components: ['app'], notes: 'Notes' }),
      execute: () => Promise.reject(new Error('a provided step must not execute')),
      changed: (): void => undefined,
      crashed: (cause): void => {
        throw cause instanceof Error ? cause : new Error(String(cause));
      },
    };
    const queue = new ReleaseQueue(ports);
    const publications = new ReleasePublications();
    publications.listen((component, commit) => queue.completeWaiting(component, commit));
    await queue.submit({ tip: TIP, pushedFrom: null, paths: null });
    await queue.settled();
    expect((await record.list())[0]?.status).toBe('waiting');
    await publications.published('app', 'b'.repeat(40));
    expect((await record.list())[0]?.status).toBe('waiting');
    await publications.published('app', TIP);
    expect((await record.list())[0]?.status).toBe('done');
  });
});
