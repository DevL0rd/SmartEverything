import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';
import { parseArgs } from 'node:util';
import { hubApi } from './api.ts';
import { seedActivity } from './activity.ts';
import { seedAssistant } from './assistant.ts';
import { seedAutomations } from './automations.ts';
import { anchorAt, SEED } from './clock.ts';
import type { Counted, FilesContext, PersonRef, SeedContext } from './context.ts';
import { seedDriveApi, scanAll } from './drive-api.ts';
import { seedCameraRecordings } from './camera-recordings.ts';
import { seedDriveHistory } from './drive-history.ts';
import { seedDriveShares, SHARE_PASSWORD } from './drive-late.ts';
import { writeDriveFiles } from './drive.ts';
import { assertLoopback, scratchPaths, type ScratchPaths } from './guard.ts';
import { seedHealth } from './health.ts';
import {
  buildService,
  freePorts,
  prepareFolders,
  removeScratch,
  removeServiceBuild,
  SERVICE_BUILD,
  startHub,
  writeServiceConfig,
  type Ports,
  type RunningHub,
} from './hub.ts';
import { seedHomeMap } from './home-map.ts';
import { seedHousehold } from './household.ts';
import { environmentSecrets, redact, scanFolder } from './leaks.ts';
import { seedPhotosApi } from './photos-api.ts';
import { writePhotoFiles } from './photos.ts';
import { seedPlanner } from './planner.ts';
import { seeded, type Random } from './random.ts';
import { openSeedStore } from './store.ts';
import { shortfalls } from './minimums.ts';
import { countsOf, waitForMedia } from './verify.ts';

const LOOPBACK = '127.0.0.1';

type Datasets = Readonly<Record<string, Counted>>;

export interface SeedReport {
  readonly counts: Counted;
  readonly datasets: Datasets;
  readonly leaks: readonly string[];
  readonly links: readonly string[];
  readonly url: string | null;
}

interface Staged {
  readonly deviceIds: ReadonlyMap<string, string>;
  readonly context: FilesContext;
  readonly datasets: Datasets;
}

function say(secrets: readonly string[], text: string): void {
  process.stdout.write(`${redact(text, secrets)}\n`);
}

async function storePhase(paths: ScratchPaths): Promise<Staged> {
  const anchor = anchorAt(new Date());
  const rng = (label: string): Random => seeded(SEED, label);
  const { store, close } = await openSeedStore(paths);
  try {
    const household = seedHousehold(store, anchor, rng('household'));
    const people: PersonRef[] = store.profiles.list().map((profile, index) => ({
      id: profile.id,
      name: profile.name,
      owner: index === 0,
    }));
    const datasets = {
      household: {
        profiles: household.profiles.length,
        rooms: household.rooms,
        devices: household.devices,
        historyRows: household.historyRows,
        metricRows: household.metricRows,
        events: household.events,
      },
      health: { ...seedHealth(store, household.profiles, anchor, rng('health')) },
      assistant: { ...seedAssistant(store, people, anchor, rng('assistant')) },
      activity: {
        ...seedActivity(store, household, anchor, rng),
      },
    };
    return { deviceIds: household.deviceIds, context: { paths, anchor, people, rng }, datasets };
  } finally {
    await close();
  }
}

async function filesPhase(context: FilesContext): Promise<Datasets> {
  return {
    driveFiles: await writeDriveFiles(context),
    photoFiles: await writePhotoFiles(context),
  };
}

async function apiPhase(hub: RunningHub, staged: Staged, library: number): Promise<Datasets> {
  const api = hubApi(hub.url, hub.token);
  const context: SeedContext = { ...staged.context, api, deviceIds: staged.deviceIds };
  await scanAll(api);
  await waitForMedia(api, library);
  return {
    automations: await seedAutomations(context),
    planner: await seedPlanner(context),
    driveApi: await seedDriveApi(context),
    photosApi: await seedPhotosApi(context),
    homeMap: await seedHomeMap(context),
  };
}

interface Late {
  readonly datasets: Datasets;
  readonly paths: readonly string[];
}

async function latePhase(paths: ScratchPaths, context: FilesContext): Promise<Late> {
  const { store, close } = await openSeedStore(paths);
  try {
    const shares = await seedDriveShares(store, context);
    return {
      datasets: {
        driveShares: shares.counts,
        driveHistory: await seedDriveHistory(store, context),
        cameraRecordings: await seedCameraRecordings(store, context),
      },
      paths: shares.paths,
    };
  } finally {
    await close();
  }
}

interface Running {
  readonly paths: ScratchPaths;
  readonly ports: Ports;
  readonly secrets: string[];
  readonly keep: boolean;
}

async function withHub<T>(
  running: Running,
  work: (hub: RunningHub) => Promise<T>,
): Promise<{ result: T; hub: RunningHub }> {
  const { paths, ports, secrets, keep } = running;
  const hub = await startHub(paths, ports);
  secrets.push(hub.token);
  try {
    return { result: await work(hub), hub };
  } catch (cause) {
    await hub.stop();
    throw cause;
  } finally {
    if (!keep) await hub.stop();
  }
}

export async function seedHub(
  name: string,
  serve: boolean,
  reuseBuild: boolean,
): Promise<SeedReport> {
  assertLoopback(LOOPBACK);
  const paths = scratchPaths({ name, environment: env });
  const secrets = environmentSecrets(env);
  await prepareFolders(paths);
  if (!reuseBuild || !existsSync(join(SERVICE_BUILD, 'service.mjs'))) await buildService();
  const staged = await storePhase(paths);
  const files = await filesPhase(staged.context);
  const library = files['photoFiles']?.['ownerLibrary'] ?? 0;
  const ports = await freePorts();
  await writeServiceConfig(paths, ports);
  const filled = await withHub({ paths, ports, secrets, keep: false }, (hub) =>
    apiPhase(hub, staged, library),
  );
  const late = await latePhase(paths, staged.context);
  const checked = await withHub({ paths, ports, secrets, keep: serve }, async (hub) => {
    const api = hubApi(hub.url, hub.token);
    await waitForMedia(api, library - (filled.result['photosApi']?.['archived'] ?? 0));
    return countsOf(api);
  });
  const missing = shortfalls(checked.result);
  if (missing.length > 0) throw new Error(`The seeded Hub is short of data: ${missing.join('; ')}`);
  const leaks = (await scanFolder(paths.base, paths.data, secrets)).map(
    (leak) => `${leak.file}: ${leak.what}`,
  );
  return {
    counts: checked.result,
    datasets: { ...staged.datasets, ...files, ...filled.result, ...late.datasets },
    leaks,
    links: late.paths.map(
      (path, index) =>
        `${checked.hub.url}${path}${index === 1 ? ` (password ${SHARE_PASSWORD})` : ''}`,
    ),
    url: serve ? checked.hub.url : null,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      serve: { type: 'boolean', default: false },
      remove: { type: 'boolean', default: false },
      'reuse-build': { type: 'boolean', default: false },
    },
  });
  if (values.name === undefined) throw new Error('Pass --name <n>.');
  const paths = scratchPaths({ name: values.name, environment: env });
  if (values.remove) {
    await removeScratch(paths);
    await removeServiceBuild();
    say([], `Removed ${paths.base} and the scratch Hub build.`);
    return;
  }
  const secrets = environmentSecrets(env);
  const report = await seedHub(values.name, values.serve, values['reuse-build']);
  say(secrets, JSON.stringify({ counts: report.counts, datasets: report.datasets }, null, 2));
  for (const link of report.links) say(secrets, link);
  if (report.leaks.length > 0)
    throw new Error(`Secrets found in the seeded folder: ${report.leaks.join(', ')}`);
  say(
    secrets,
    `Seeded ${paths.base}${report.url === null ? '' : `; the Hub runs at ${report.url}`}.`,
  );
}

if (import.meta.main) await main();
