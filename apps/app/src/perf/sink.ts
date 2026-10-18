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
  listContent(list: string, height: number): void;
  listScroll(list: string, offset: number): void;
}

export interface ProbeSession {
  readonly sink: PerfSink;
  readonly stop: () => void;
}

let session: ProbeSession | null = null;
let currentScreen = '';

export function sinkOf(): PerfSink | null {
  return session === null ? null : session.sink;
}

export function rememberScreen(screen: string): void {
  currentScreen = screen;
}

export function attachSession(next: ProbeSession): void {
  session = next;
  if (currentScreen !== '') {
    next.sink.screen(currentScreen);
  }
}

export function detachSession(): ProbeSession | null {
  const previous = session;
  session = null;
  return previous;
}
