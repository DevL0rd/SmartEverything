import { join } from 'node:path';
import { DAVEY_PACKAGE, VOICE_ASSET_PREFIX } from './copy-voice-assets.ts';
import { UPDATE_ENTRY_DIRECTORY } from './hub-install-layout.ts';
import { UPDATE_ENTRIES } from './self-update-files.ts';
import { OPENVINO_PACKAGE } from './service-target.ts';

export interface Bundle {
  readonly entry: string;
  readonly file: string;
  readonly external: readonly string[];
  readonly banner?: string;
  readonly define?: Readonly<Record<string, string>>;
}

const hub = join(import.meta.dirname, '..', 'apps', 'hub');

export const SERVICE_BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; import { fileURLToPath as serviceFileUrlToPath } from "node:url"; import { dirname as serviceDirname } from "node:path"; const require = createServiceRequire(import.meta.url); const __filename = serviceFileUrlToPath(import.meta.url); const __dirname = serviceDirname(__filename);';
export const VOICE_EXTERNALS = [DAVEY_PACKAGE, 'ffmpeg-static', `${VOICE_ASSET_PREFIX}*`, '*.node'];
export const SERVICE_EXTERNALS = [
  '@deepseek-ai/*',
  '@earendil-works/*',
  'jose',
  '@anthropic-ai/claude-agent-sdk',
  'ts-json-schema-generator',
  'x11',
  'usocket',
  'cpu-features',
  'sharp',
  'mediainfo.js',
  ...VOICE_EXTERNALS,
];
const serviceBundle = (name: string): Bundle => ({
  entry: join(hub, 'src', `${name}.ts`),
  file: `${name}.mjs`,
  external: SERVICE_EXTERNALS,
  banner: SERVICE_BANNER,
});
export const BUNDLES: readonly Bundle[] = [
  serviceBundle('service'),
  serviceBundle('service-main'),
  {
    entry: join(hub, 'src', 'plugins', 'builtin', 'discord', 'voice', 'isolated', 'worker.ts'),
    file: 'voice-worker.mjs',
    external: VOICE_EXTERNALS,
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'photos', 'pipeline', 'heic-worker.ts'),
    file: 'heic-worker.mjs',
    external: [],
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'photos', 'edits', 'colour-worker.ts'),
    file: 'colour-worker.mjs',
    external: [],
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'service', 'loop-watchdog', 'worker.ts'),
    file: 'loop-watchdog.mjs',
    external: [],
  },
  { entry: join(hub, 'src', 'claude', 'hook-helper.ts'), file: 'hook-helper.mjs', external: [] },
  {
    entry: join(hub, 'src', 'plugins', 'builtin', 'printer', 'raster-worker.ts'),
    file: 'raster-worker.mjs',
    external: [],
  },
  {
    entry: join(hub, 'src', 'drive', 'scanner-worker.ts'),
    file: 'scanner-worker.mjs',
    external: [],
  },
  {
    entry: join(hub, 'src', 'logs', 'worker.ts'),
    file: 'log-worker.mjs',
    external: [],
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'codec', 'worker.ts'),
    file: 'codec-worker.mjs',
    external: [],
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'drive', 'mount', 'hash-worker.ts'),
    file: 'mount-hash-worker.mjs',
    external: [],
  },
  {
    entry: join(hub, 'src', 'drive', 'hasher-worker.ts'),
    file: 'hasher-worker.mjs',
    external: [],
  },
  {
    entry: join(hub, 'src', 'drive', 'metadata-worker.ts'),
    file: 'metadata-worker.mjs',
    external: ['mediainfo.js'],
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'drive', 'content', 'content-worker.ts'),
    file: 'content-worker.mjs',
    external: [],
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'vacuum', 'map-worker.ts'),
    file: 'vacuum-map-worker.mjs',
    external: [],
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'store', 'host', 'worker.ts'),
    file: 'store-host.mjs',
    external: SERVICE_EXTERNALS,
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'computers', 'local-computer-worker.ts'),
    file: 'local-computer-worker.mjs',
    external: SERVICE_EXTERNALS,
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'vision', 'faces', 'worker.ts'),
    file: 'faces-worker.mjs',
    external: [OPENVINO_PACKAGE, 'sharp'],
    banner: SERVICE_BANNER,
  },
  ...UPDATE_ENTRIES.map(({ entry, file }): Bundle => ({
    entry,
    file: `${UPDATE_ENTRY_DIRECTORY}/${file}`,
    external: SERVICE_EXTERNALS,
    banner: SERVICE_BANNER,
  })),
];
