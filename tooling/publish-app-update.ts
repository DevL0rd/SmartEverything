import { join } from 'node:path';
import { env } from 'node:process';
import { parseArgs as parseNodeArgs } from 'node:util';
import {
  APP_UPDATE_CHANNELS,
  APP_UPDATE_PLATFORMS,
  RELEASE_NOTES,
  RELEASE_NOTES_MAX_LENGTH,
  appUpdateSummaryOf,
  type AppUpdateListing,
  type AppUpdateEntry,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import {
  listUpdates,
  promoteUpdate,
  pruneUpdates,
  rollbackUpdates,
  withdrawUpdate,
} from './app-update-store.ts';
import { applyBuildHost, requireBuildHost } from './build-host.ts';
import { dataRootOf } from './data-root.ts';
import { localHub } from './local-hub.ts';
import type { PublisherTarget } from './machine-update-client.ts';
import { ANDROID_EXPORT, publishAndroid } from './publish-app-update-android.ts';
import { DESKTOP_DIRECTORY, WEB_EXPORT, publishDesktop } from './publish-app-update-desktop.ts';
import { runCommand, type Dependencies } from './publish-app-update-shared.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import { desktopWebRuntime } from '../apps/desktop/packaging/web-runtime.ts';

const log = new Logger('tool.publish-app-update');

export const USAGE = [
  'publish-app-update <command> [options]',
  '  publish --platform android|desktop|all --channel release|dev --notes "<release notes>" [--launch-file <js file>]',
  '  promote --id <id> --channel release|dev',
  '  rollback --platform android|desktop --channel release|dev --reason "<why>" [--to-embedded]',
  '  withdraw --id <id> --reason "<why>"   (the newest live entry of a target is rolled back: the previous good one is republished)',
  '  list',
  '  prune',
  'options',
  '  --data <folder>        hub data folder, default the one the data folder pointer names (every command)',
  `  --notes <text>        full release notes, including line breaks (1 to ${String(RELEASE_NOTES_MAX_LENGTH)} characters, publish)`,
  '  --server <https url>   public hub address for the build, default EXPO_PUBLIC_SERVER_URL (publish)',
  '  --launch-file <file>   publish a .js crash fixture instead of an export (publish, android, dev only)',
].join('\n');

export class PublishUsageError extends Error {
  override readonly name = 'PublishUsageError';

  constructor(problem: string) {
    super(`${problem}\n${USAGE}`);
  }
}

const CHANNEL = z.enum(APP_UPDATE_CHANNELS);
const REASON = z.string().trim().min(1);

const HUB = { data: z.string().min(1).optional() } as const;

const PUBLISH_ARGUMENTS = z.strictObject({
  command: z.literal('publish'),
  platform: z.enum([...APP_UPDATE_PLATFORMS, 'all']),
  channel: CHANNEL,
  notes: RELEASE_NOTES,
  server: z.url({ protocol: /^https$/u }),
  launchFile: z.string().min(1).optional(),
  ...HUB,
});

const ARGUMENTS = z.discriminatedUnion('command', [
  PUBLISH_ARGUMENTS,
  z.strictObject({ command: z.literal('promote'), id: z.uuid(), channel: CHANNEL, ...HUB }),
  z.strictObject({
    command: z.literal('rollback'),
    platform: z.enum(APP_UPDATE_PLATFORMS),
    channel: CHANNEL,
    reason: REASON,
    toEmbedded: z.boolean(),
    ...HUB,
  }),
  z.strictObject({ command: z.literal('withdraw'), id: z.uuid(), reason: REASON, ...HUB }),
  z.strictObject({ command: z.literal('list'), ...HUB }),
  z.strictObject({ command: z.literal('prune'), ...HUB }),
]);

export type PublishArguments = z.infer<typeof PUBLISH_ARGUMENTS>;

export type Arguments = z.infer<typeof ARGUMENTS>;

export interface Defaults {
  readonly server: string | undefined;
}

const FLAGS = {
  platform: { type: 'string' },
  channel: { type: 'string' },
  notes: { type: 'string' },
  id: { type: 'string' },
  reason: { type: 'string' },
  'to-embedded': { type: 'boolean' },
  data: { type: 'string' },
  server: { type: 'string' },
  'launch-file': { type: 'string' },
} as const;

type Flags = ReturnType<typeof parseNodeArgs<{ options: typeof FLAGS; allowPositionals: true }>>;

function readFlags(argv: readonly string[]): Flags {
  try {
    return parseNodeArgs({ args: [...argv], allowPositionals: true, options: FLAGS });
  } catch (error) {
    if (error instanceof TypeError) throw new PublishUsageError(error.message);
    throw error;
  }
}

export function parseArgs(argv: readonly string[], defaults: Defaults): Arguments {
  const { values, positionals } = readFlags(argv);
  const given = Object.entries({
    platform: values.platform,
    channel: values.channel,
    notes: values.notes,
    id: values.id,
    reason: values.reason,
    toEmbedded: values['to-embedded'] ?? (positionals[0] === 'rollback' ? false : undefined),
    data: values.data,
    server: values.server ?? (positionals[0] === 'publish' ? defaults.server : undefined),
    launchFile: values['launch-file'],
  }).filter(([, value]) => value !== undefined);
  const parsed = ARGUMENTS.safeParse({ command: positionals[0], ...Object.fromEntries(given) });
  if (positionals.length > 1) throw new PublishUsageError(`Unexpected ${positionals[1] ?? ''}`);
  if (parsed.success) return parsed.data;
  throw new PublishUsageError(
    parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
  );
}

interface UpdateRow {
  readonly id: string;
  readonly platform: string;
  readonly channel: string;
  readonly runtimeVersion: string;
  readonly createdAt: string;
  readonly appVersion: string;
  readonly size: number;
  readonly withdrawn: AppUpdateEntry['withdrawn'];
  readonly notes: string;
}

function rowLine(row: UpdateRow): string {
  const state = row.withdrawn === null ? 'live' : `withdrawn: ${row.withdrawn.reason}`;
  return [
    row.id,
    row.platform,
    row.channel,
    row.runtimeVersion,
    row.createdAt,
    row.appVersion,
    `${String(row.size)} bytes`,
    state,
    row.notes,
  ].join('  ');
}

export function listLines(listing: readonly AppUpdateListing[]): readonly string[] {
  return listing.map(rowLine);
}

export function entryLines(entries: readonly AppUpdateEntry[]): readonly string[] {
  return entries.map((entry) => rowLine({ ...entry, size: appUpdateSummaryOf(entry).size }));
}

async function executePublish(
  args: PublishArguments,
  target: PublisherTarget,
  dependencies: Dependencies,
): Promise<readonly string[]> {
  if (args.launchFile !== undefined && args.platform !== 'android') {
    throw new PublishUsageError('--launch-file needs --platform android');
  }
  const request = {
    target,
    server: args.server,
    channel: args.channel,
    notes: args.notes,
    launchFile: args.launchFile,
  };
  const entries: AppUpdateEntry[] = [];
  if (args.platform !== 'desktop') entries.push(await publishAndroid(request, dependencies));
  if (args.platform !== 'android') entries.push(await publishDesktop(request, dependencies));
  return entries.map((entry) => JSON.stringify(entry, null, 2));
}

export const REPUBLISH_NOTE =
  'The previous good entry was republished under a new id and time, because clients only accept newer updates; devices already on it download it once more.';

export function withRepublishNote(entries: readonly AppUpdateEntry[]): readonly string[] {
  const lines = entryLines(entries);
  return entries.some((entry) => entry.withdrawn === null) ? [...lines, REPUBLISH_NOTE] : lines;
}

async function executePrune(target: PublisherTarget): Promise<readonly string[]> {
  const { removed } = await pruneUpdates(target);
  log.info('app_update.pruned', { removed: removed.length });
  return removed.length === 0 ? ['no unused blobs'] : removed.map((name) => `removed ${name}`);
}

export async function execute(
  args: Arguments,
  target: PublisherTarget,
  dependencies: Dependencies,
): Promise<readonly string[]> {
  switch (args.command) {
    case 'publish':
      return executePublish(args, target, dependencies);
    case 'promote':
      return entryLines(
        (await promoteUpdate(target, { id: args.id, channel: args.channel })).entries,
      );
    case 'rollback':
      return withRepublishNote(
        (
          await rollbackUpdates(target, {
            platform: args.platform,
            channel: args.channel,
            reason: args.reason,
            toEmbedded: args.toEmbedded,
          })
        ).entries,
      );
    case 'withdraw':
      return withRepublishNote(
        (await withdrawUpdate(target, { id: args.id, reason: args.reason })).entries,
      );
    case 'list':
      return listLines(await listUpdates(target));
    case 'prune':
      return executePrune(target);
  }
}

const HOST = z.object({ EXPO_PUBLIC_SERVER_URL: z.string().optional() });

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), {
    server: HOST.parse(env).EXPO_PUBLIC_SERVER_URL,
  });
  const layout = dataLayoutOf(await dataRootOf(args.data, env));
  if (args.command === 'publish') {
    const root = join(import.meta.dirname, '..');
    applyBuildHost(layout, root);
    requireBuildHost(layout, root, args.platform === 'desktop' ? 'ui' : 'app');
  }
  const lines = await execute(args, await localHub(layout), {
    run: runCommand,
    exportDirectory: ANDROID_EXPORT,
    webDirectory: WEB_EXPORT,
    desktopRuntime: () => desktopWebRuntime(DESKTOP_DIRECTORY),
  });
  for (const line of lines) process.stdout.write(`${line}\n`);
}

if (import.meta.main) await main();
