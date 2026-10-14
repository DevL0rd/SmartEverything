import { z } from 'zod';
import type { HarnessRuntimeEvent } from '../host/events';
import type { HarnessRuntime } from '../host/runtime';
import type { HarnessControlPersistence } from './contracts';
import type { ProcessProjection } from './projection';
import { projectHarnessWork } from './projection';
import type { AiHarnessSession, DshWriterClaim } from '@smarteverything/domain';
const LINEAGE = z.object({ origin: z.string().optional(), parentSession: z.string().optional() });
export class ProcessChildren {
  private readonly parents = new Map<string, string>();
  constructor(
    private readonly runtime: HarnessRuntime,
    private readonly persistence: HarnessControlPersistence,
    private readonly ports: {
      readonly projection: ProcessProjection;
      readonly opened: Map<string, unknown>;
      readonly closed: Map<string, DshWriterClaim>;
    },
  ) {
    this.ports.projection.idle = async (id): Promise<void> => {
      await runtime.get(id).flush();
    };
    this.ports.projection.workFor = (id): AiHarnessSession['work'] => [
      ...projectHarnessWork(id, runtime.get(id).work()),
      ...this.work(id),
    ];
  }
  async opened(id: string): Promise<void> {
    const header = LINEAGE.parse((await this.persistence.metadata(id)).header);
    if (header.origin !== 'subagent' || header.parentSession === undefined) return;
    if (header.parentSession === id || this.descendants(id).includes(header.parentSession))
      throw new Error('Native child lineage contains a cycle.');
    this.parents.set(id, header.parentSession);
  }
  event(event: HarnessRuntimeEvent): void {
    if (event.kind !== 'status') return;
    let parent = this.parents.get(event.sessionId);
    while (parent !== undefined) {
      this.ports.projection.event({
        kind: 'status',
        sessionId: parent,
        status: this.runtime.get(parent).work().turn ? 'running' : 'idle',
      });
      parent = this.parents.get(parent);
    }
  }
  work(id: string): AiHarnessSession['work'] {
    return this.descendants(id).flatMap((child): AiHarnessSession['work'] => {
      const work = projectHarnessWork(child, this.runtime.get(child).work());
      return work.length === 0
        ? []
        : [
            {
              kind: 'child',
              id: child,
              reason: 'Admitted same-host native child work has not settled.',
            },
            ...work,
          ];
    });
  }
  async settle(id: string, mode: 'drain' | 'close' | 'interrupt'): Promise<void> {
    for (const child of this.descendants(id)) {
      const session = this.runtime.get(child);
      if (mode === 'interrupt') await session.interrupt();
      else await session.drain();
      await this.ports.projection.flush(child);
      if (mode === 'close') {
        const claim = this.persistence.claim(child);
        await this.runtime.close(child);
        this.ports.projection.close(child);
        this.ports.opened.delete(child);
        this.ports.closed.set(child, claim);
        this.parents.delete(child);
      }
    }
  }
  closed(id: string): void {
    this.parents.delete(id);
  }
  private descendants(id: string): string[] {
    return [...this.parents]
      .filter(([, parent]) => parent === id)
      .flatMap(([child]) => [...this.descendants(child), child]);
  }
}
