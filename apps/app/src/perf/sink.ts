import { perfRuntime } from './runtime';

export interface PerfSink {
  record(id: string, ms: number, mounted: boolean): void;
  screenCommit(label: string, phase: string, ms: number): void;
  screenMount(label: string, ms: number): void;
  screenUnmount(label: string, lifeMs: number): void;
  action(kind: string, label: string): void;
  screen(screen: string): void;
  store(previous: object, next: object, listeners: number): void;
  touch(phase: 'start' | 'move' | 'end'): void;
  listRows(list: string, delta: number, total: number): void;
  listCell(list: string, index: number, y: number, height: number): void;
  listGone(list: string, index: number): void;
  listViewport(list: string, height: number): void;
  listScroll(list: string, offset: number): void;
}

export function sinkOf(): PerfSink | null {
  return perfRuntime.state.status === 'running' ? perfRuntime.state.session.sink : null;
}

export function rememberScreen(screen: string): void {
  perfRuntime.screen = screen;
}
