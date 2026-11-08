import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { HubLayout } from './layout';

export const HUB_HOME_VARIABLE = 'SMARTEVERYTHING_HUB_HOME';
export const LOCATION_FILE = 'location.json';
const BOOTSTRAP_DIRECTORY = 'SmartEverything-Hub';

const ABSOLUTE_PATH = z.string().refine(isAbsolute, { message: 'must be an absolute path' });

export const LOCATION = z.strictObject({
  root: ABSOLUTE_PATH,
  rootId: z.uuid(),
  state: z.enum(['active', 'pending-v1']),
});

export const MARKER = z.strictObject({
  version: z.literal(1),
  rootId: z.uuid(),
  createdAt: z.iso.datetime(),
  state: z.enum(['active', 'moved']),
  movedTo: ABSOLUTE_PATH.optional(),
});

export type Location = Readonly<z.infer<typeof LOCATION>>;
export type Marker = Readonly<z.infer<typeof MARKER>>;

export interface PointerEnvironment {
  readonly [HUB_HOME_VARIABLE]?: string | undefined;
  readonly XDG_CONFIG_HOME?: string | undefined;
}

export interface FileOperations {
  readonly rename: (from: string, to: string) => Promise<void>;
}

const NODE_FILE_OPERATIONS: FileOperations = { rename };

export class LocationError extends Error {
  override readonly name = 'LocationError';

  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`the data folder pointer ${file} ${reason}`);
  }
}

export class MarkerError extends Error {
  override readonly name = 'MarkerError';
}

export function bootstrapDirectory(environment: PointerEnvironment): string {
  const explicit = environment[HUB_HOME_VARIABLE];
  if (explicit !== undefined) {
    return ABSOLUTE_PATH.parse(explicit);
  }
  const xdg = environment.XDG_CONFIG_HOME;
  const config = xdg !== undefined && isAbsolute(xdg) ? xdg : join(homedir(), '.config');
  return join(config, BOOTSTRAP_DIRECTORY);
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function atomicWrite(
  file: string,
  text: string,
  operations: FileOperations = NODE_FILE_OPERATIONS,
): Promise<void> {
  const directory = dirname(file);
  await mkdir(directory, { recursive: true });
  const staged = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(staged, 'wx', 0o600);
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await operations.rename(staged, file);
  } catch (error) {
    await rm(staged, { force: true });
    throw error;
  }
  await syncDirectory(directory);
}

async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function parsedJson<T>(file: string, text: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new LocationError(file, `is not valid JSON: ${String(error)}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new LocationError(file, `is invalid: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export async function readLocation(directory: string): Promise<Location> {
  const file = join(directory, LOCATION_FILE);
  const text = await readText(file);
  if (text === undefined) {
    throw new LocationError(file, 'is missing; set up the hub data folder first');
  }
  return parsedJson(file, text, LOCATION);
}

export async function writeLocation(
  directory: string,
  location: Location,
  operations?: FileOperations,
): Promise<void> {
  const checked = LOCATION.parse(location);
  await atomicWrite(
    join(directory, LOCATION_FILE),
    `${JSON.stringify(checked, null, 2)}\n`,
    operations,
  );
}

export async function resolveHubRoot(environment: PointerEnvironment): Promise<Location> {
  return readLocation(bootstrapDirectory(environment));
}

export async function readMarker(layout: Pick<HubLayout, 'marker'>): Promise<Marker | undefined> {
  const text = await readText(layout.marker);
  return text === undefined ? undefined : parsedJson(layout.marker, text, MARKER);
}

export async function writeMarker(
  layout: Pick<HubLayout, 'marker'>,
  marker: Marker,
  operations?: FileOperations,
): Promise<void> {
  const checked = MARKER.parse(marker);
  await atomicWrite(layout.marker, `${JSON.stringify(checked, null, 2)}\n`, operations);
}

export async function verifyMarker(
  layout: Pick<HubLayout, 'marker' | 'root'>,
  rootId: string,
): Promise<Marker> {
  const marker = await readMarker(layout);
  if (marker?.rootId !== rootId) {
    throw new MarkerError(
      `the data folder at ${layout.root} is missing or is a different disk (not mounted?)`,
    );
  }
  if (marker.state === 'moved') {
    throw new MarkerError(
      `the data folder at ${layout.root} was moved to ${marker.movedTo ?? 'another folder'}; update the pointer`,
    );
  }
  return marker;
}
