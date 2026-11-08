import type { ReactNode } from 'react';
import { Profiler } from 'react';
import { readDeveloperFlags } from '../developer/flags';
import { sinkOf } from './sink';

export function count(id: string): void {
  sinkOf()?.record(id, 0, false);
}

export function counted(id: string, handler: () => void): () => void {
  return readDeveloperFlags()['perf.profilers'] && sinkOf() !== null
    ? wrapperOf(id, handler)
    : handler;
}

function wrapperOf(id: string, handler: () => void): () => void {
  return (): void => {
    count(id);
    handler();
  };
}

function measured<T>(id: string, work: () => T): T {
  const start = performance.now();
  const result = work();
  sinkOf()?.record(id, performance.now() - start, false);
  return result;
}

export function timed<T>(id: string, work: () => T): T {
  return sinkOf() === null ? work() : measured(id, work);
}

function ProbeProfiler({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}): ReactNode {
  if (sinkOf() === null) {
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

export function PerfProbe({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}): ReactNode {
  if (sinkOf() === null) {
    return children;
  }
  return readDeveloperFlags()['perf.profilers'] ? (
    <ProbeProfiler id={id}>{children}</ProbeProfiler>
  ) : (
    children
  );
}
