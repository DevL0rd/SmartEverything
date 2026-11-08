import {
  buildAlbums,
  buildConflicts,
  buildQuotas,
  buildShares,
  buildTrash,
  buildUsage,
  buildVersions,
} from './drive-fixture/extras';
import { buildRoot } from './drive-fixture/items';
import { fileCount, makePeople, planRoots } from './drive-fixture/plans';
import { createRandom, iso, NOW_MS } from './drive-fixture/random';
import type { NonEmpty } from './drive-fixture/random';
import { makeRoot, syncClientsFor } from './drive-fixture/roots';
import { DRIVE_FIXTURE_SIZES } from './drive-fixture/types';
import type { DriveFixture, DriveFixtureOptions } from './drive-fixture/types';

export { DRIVE_FIXTURE_SIZES } from './drive-fixture/types';
export type {
  DriveFixture,
  DriveFixtureAlbumItem,
  DriveFixtureOptions,
  DriveFixturePerson,
  DriveFixtureSize,
} from './drive-fixture/types';

export function generateDriveFixture(options: DriveFixtureOptions): DriveFixture {
  const random = createRandom(options.seed);
  const people = makePeople(random);
  const deviceIds: NonEmpty<string> = [random.uuid(), random.uuid(), random.uuid()];
  const plans = planRoots(random, people, options.size);
  const total = DRIVE_FIXTURE_SIZES[options.size];
  const built = plans.map((plan) => buildRoot(random, plan, fileCount(plan, plans, total)));
  const items = built.flatMap((entry) => entry.items);
  const syncClients = plans.flatMap((plan) => syncClientsFor(random, plan, people, deviceIds));
  const versions = built.flatMap((entry) => buildVersions(random, entry, deviceIds));
  const trash = built.flatMap((entry) => buildTrash(random, entry));
  const usage = buildUsage([...people.map((person) => person.id), null], items, versions, trash);
  const { albums, members } = buildAlbums(random, people, built);
  return {
    seed: options.seed,
    size: options.size,
    now: iso(NOW_MS),
    people,
    deviceIds,
    roots: built.map((entry) =>
      makeRoot(
        entry,
        syncClients.filter((client) => client.rootId === entry.plan.id),
      ),
    ),
    items,
    albums,
    albumItems: members,
    trash,
    versions,
    shares: built.flatMap((entry) => buildShares(random, entry, people[0].id)),
    syncClients,
    conflicts: built.flatMap((entry) => buildConflicts(random, entry, people, deviceIds)),
    quotas: buildQuotas(people, usage),
    usage,
    settings: {
      uploadExpiryDays: 7,
      membersMayShare: false,
      duplicatesHashing: true,
      indexingPaused: false,
    },
  };
}
