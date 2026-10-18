import type { ReactNode } from 'react';
import { Profiler } from 'react';
import { readDeveloperFlags } from '../developer/flags';
import { sinkOf } from './sink';

export function count(id: string): void {
  if (__DEV__ && readDeveloperFlags()['perf.profilers']) {
    sinkOf()?.record(id, 0, false);
  }
}

export function counted(id: string, handler: () => void): () => void {
  if (!__DEV__ || !readDeveloperFlags()['perf.profilers']) {
    return handler;
  }
  return (): void => {
    count(id);
    handler();
  };
}

export function timed<T>(id: string, work: () => T): T {
  if (!__DEV__ || !readDeveloperFlags()['perf.profilers']) {
    return work();
  }
  const start = performance.now();
  const result = work();
  sinkOf()?.record(id, performance.now() - start, false);
  return result;
}

export function PerfProbe({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}): ReactNode {
  if (!__DEV__ || !readDeveloperFlags()['perf.profilers']) {
    return children;
  }
  return (
    <Profiler
      id={id}
      onRender={(_id, phase, actual) => {
        sinkOf()?.record(id, actual, phase === 'mount');
      }}
    >
      {children}
    </Profiler>
  );
}
