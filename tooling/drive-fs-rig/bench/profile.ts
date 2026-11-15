import { z } from 'zod';

const NODE = z.object({
  id: z.number(),
  callFrame: z.object({
    functionName: z.string(),
    url: z.string(),
    lineNumber: z.number(),
  }),
});

const PROFILE = z.object({
  nodes: z.array(NODE),
  samples: z.array(z.number()),
  timeDeltas: z.array(z.number()),
});

export const CATEGORIES = [
  'idle',
  'garbage collection',
  'sqlite',
  'file system',
  'socket and websocket',
  'hashing and crypto',
  'application',
  'other native',
] as const;

export type Category = (typeof CATEGORIES)[number];

const SQLITE_METHODS = new Set(['run', 'get', 'all', 'exec', 'iterate', 'prepare']);
const FS_METHODS =
  /^(openSync|closeSync|readSync|writeSync|fsyncSync|statSync|lstatSync|renameSync|unlinkSync|mkdirSync|readdirSync|ftruncateSync|fstatSync|existsSync|linkSync)$/u;
const SOCKET_URL = /node_modules\/ws|node:(net|internal\/stream|internal\/stream_base|tls|http)/u;
const SOCKET_NAME =
  /^(onread|afterWrite|writeGeneric|handleWriteReq|socketOnData|receiverOnMessage|sender|send|frame)/u;
const CRYPTO_URL = /node:crypto|node:internal\/crypto/u;
const CRYPTO_NAME = /^(digest|update|createHash)$/u;
const FS_URL = /node:fs|node:internal\/fs/u;

interface Rule {
  readonly category: Category;
  readonly matches: (functionName: string, url: string) => boolean;
}

const RULES: readonly Rule[] = [
  { category: 'idle', matches: (name) => name === '(idle)' },
  { category: 'garbage collection', matches: (name) => name === '(garbage collector)' },
  {
    category: 'sqlite',
    matches: (name, url) => url.includes('node:sqlite') || (url === '' && SQLITE_METHODS.has(name)),
  },
  {
    category: 'socket and websocket',
    matches: (name, url) => SOCKET_URL.test(url) || SOCKET_NAME.test(name),
  },
  {
    category: 'hashing and crypto',
    matches: (name, url) => CRYPTO_URL.test(url) || CRYPTO_NAME.test(name),
  },
  { category: 'file system', matches: (name, url) => FS_URL.test(url) || FS_METHODS.test(name) },
  {
    category: 'other native',
    matches: (_name, url) => url === '' || url.startsWith('node:'),
  },
];

export function categorize(functionName: string, url: string): Category {
  return RULES.find((rule) => rule.matches(functionName, url))?.category ?? 'application';
}

export interface ProfileSummary {
  readonly totalMs: number;
  readonly busyMs: number;
  readonly byCategory: Readonly<Record<Category, number>>;
  readonly top: readonly {
    readonly name: string;
    readonly category: Category;
    readonly ms: number;
  }[];
}

export function summarizeProfile(text: string, topCount: number): ProfileSummary {
  const profile = PROFILE.parse(JSON.parse(text));
  const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const byCategory: Record<Category, number> = {
    idle: 0,
    'garbage collection': 0,
    sqlite: 0,
    'file system': 0,
    'socket and websocket': 0,
    'hashing and crypto': 0,
    application: 0,
    'other native': 0,
  };
  const byFunction = new Map<string, { category: Category; ms: number }>();
  let totalMs = 0;
  profile.samples.forEach((id, index) => {
    const frame = nodes.get(id);
    const ms = (profile.timeDeltas[index + 1] ?? 0) / 1000;
    totalMs += ms;
    if (frame === undefined) return;
    const category = categorize(frame.functionName, frame.url);
    byCategory[category] += ms;
    const name = `${frame.functionName === '' ? '(anonymous)' : frame.functionName} ${frame.url.split('/').slice(-2).join('/')}:${String(frame.lineNumber + 1)}`;
    const own = byFunction.get(name) ?? { category, ms: 0 };
    own.ms += ms;
    byFunction.set(name, own);
  });
  const top = [...byFunction.entries()]
    .filter(([name]) => !name.startsWith('(idle)'))
    .sort((left, right) => right[1].ms - left[1].ms)
    .slice(0, topCount)
    .map(([name, own]) => ({ name, category: own.category, ms: own.ms }));
  return { totalMs, busyMs: totalMs - byCategory.idle, byCategory, top };
}
