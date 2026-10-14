import { z } from 'zod';
import type { PerfSink } from './sink';

export interface ProbeSession {
  readonly sink: PerfSink;
  readonly stop: () => void;
}

const KEY = Symbol.for('smarteverything.perf.runtime');
const stopSchema = z.custom<() => void>((value) => typeof value === 'function');
const sinkSchema = z.custom<PerfSink>((value) => {
  const methods = [
    'record',
    'screenCommit',
    'screenMount',
    'screenUnmount',
    'action',
    'screen',
    'store',
    'touch',
    'listRows',
    'listCell',
    'listGone',
    'listViewport',
    'listScroll',
  ];
  return (
    value !== null &&
    typeof value === 'object' &&
    methods.every((name) => typeof Reflect.get(value, name) === 'function')
  );
});
const runtimeSchema = z.object({
  generation: z.number().int().nonnegative(),
  owner: z.symbol(),
  screen: z.string(),
  state: z.discriminatedUnion('status', [
    z.object({ status: z.literal('idle') }),
    z.object({ status: z.literal('starting'), key: z.string() }),
    z.object({
      status: z.literal('running'),
      key: z.string(),
      session: z.object({ sink: sinkSchema, stop: stopSchema }),
    }),
  ]),
});

type PerfRuntime = z.infer<typeof runtimeSchema>;

function runtimeOf(): PerfRuntime {
  const existing: unknown = Reflect.get(globalThis, KEY);
  if (existing !== undefined) {
    return z.custom<PerfRuntime>((value) => runtimeSchema.safeParse(value).success).parse(existing);
  }
  const created: PerfRuntime = {
    generation: 0,
    owner: Symbol('perf-owner'),
    screen: '',
    state: { status: 'idle' },
  };
  Reflect.set(globalThis, KEY, created);
  return created;
}

export const perfRuntime = runtimeOf();
