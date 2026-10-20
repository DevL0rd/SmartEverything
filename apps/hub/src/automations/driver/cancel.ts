import type { CancelReason } from '@smarteverything/flow/state/run-state';

type Listener = (reason: CancelReason) => void;

interface Entry {
  readonly controller: AbortController;
  readonly listener: Listener;
  readonly children: Set<string>;
}

export class RunCancels {
  private readonly entries = new Map<string, Entry>();

  open(runId: string, listener: Listener): AbortSignal {
    const controller = new AbortController();
    this.entries.set(runId, { controller, listener, children: new Set() });
    return controller.signal;
  }

  link(parentId: string, childId: string): void {
    this.entries.get(parentId)?.children.add(childId);
  }

  cancel(runId: string, reason: CancelReason): boolean {
    const entry = this.entries.get(runId);
    if (entry === undefined || entry.controller.signal.aborted) return false;
    entry.controller.abort(reason);
    entry.listener(reason);
    for (const child of entry.children) this.cancel(child, 'parent_cancelled');
    return true;
  }

  close(runId: string): void {
    this.entries.delete(runId);
  }

  get count(): number {
    return this.entries.size;
  }
}
