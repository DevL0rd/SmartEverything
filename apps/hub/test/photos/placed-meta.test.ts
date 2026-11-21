import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlacedMetaEditor } from '../../src/photos/placed-meta';
import { PlacesService, hostedPlaces } from '../../src/photos/places';
import { testLogger } from '../support/logs';
import { openKit, type Kit } from './organise/fixture';

let kit: Kit;
let directory = '';
let places: PlacesService;

beforeEach(async () => {
  kit = await openKit();
  directory = mkdtempSync(join(tmpdir(), 'placed-meta-'));
  const dataset = join(directory, 'cities.tsv.gz');
  writeFileSync(
    dataset,
    gzipSync(
      [
        '2001\tLisbon\tLisboa\tPT\t38.71667\t-9.13333',
        '2002\tPorto\tPorto\tPT\t41.14961\t-8.61099',
      ].join('\n'),
    ),
  );
  places = new PlacesService({
    store: hostedPlaces(kit.store.host),
    datasetPath: (): Promise<string> => Promise.resolve(dataset),
    log: testLogger(),
  });
  await places.load();
});
afterEach(async () => {
  await kit.test.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('editing the location of a photo', () => {
  it('gives the photo the nearest place at once, then none when the location is cleared', async () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const editor = new PlacedMetaEditor(kit.store.host);
    await editor.edit(kit.alice, {
      itemIds: [id],
      location: { latitude: 41.15, longitude: -8.61, label: 'Porto' },
    });
    expect(kit.row(id)).toMatchObject({ place_id: '2002' });
    await editor.edit(kit.alice, {
      itemIds: [id],
      location: { latitude: 38.72, longitude: -9.14, label: null },
    });
    expect(kit.row(id)).toMatchObject({ place_id: '2001' });
    await editor.edit(kit.alice, { itemIds: [id], location: null });
    expect(kit.row(id)).toMatchObject({ place_id: null });
  });

  it('leaves the place alone when only the date changes', async () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const editor = new PlacedMetaEditor(kit.store.host);
    await editor.edit(kit.alice, {
      itemIds: [id],
      location: { latitude: 41.15, longitude: -8.61, label: null },
    });
    await editor.edit(kit.alice, { itemIds: [id], date: { kind: 'shift', minutes: 5 } });
    expect(kit.row(id)).toMatchObject({ place_id: '2002' });
  });
});
