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

let active: PerfSink | null = null;
let pendingScreen = '';

export function setSink(sink: PerfSink): void {
  active = sink;
  if (pendingScreen !== '') {
    sink.screen(pendingScreen);
  }
}

export function sinkOf(): PerfSink | null {
  return active;
}

export function rememberScreen(screen: string): void {
  pendingScreen = screen;
}
