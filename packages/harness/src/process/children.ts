import { z } from 'zod';
import { recordHelperSettlement } from './helper-settlement';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { HarnessRuntimeEvent } from '../host/events';
import type { HarnessRuntime } from '../host/runtime';
import type { HarnessControlPersistence } from './contracts';
import type { NativeForward } from './native-forward';
import { projectHarnessWork } from './work-projection';
import type { AiHarnessSession } from '@smarteverything/domain';
const LINEAGE = z.object({ origin: z.string().optional(), parentSession: z.string().optional() });
const CATALOGED = z.object({ childId: z.string().min(1) });
export class ProcessChildren {
  private readonly parents = new Map<string, string>();
  private readonly implicit = new Set<string>();
  private readonly delegated = new Map<string, string>();
  private readonly working = new Set<string>();
  constructor(
    private readonly runtime: HarnessRuntime,
    private readonly persistence: HarnessControlPersistence,
    private readonly ports: {
      readonly forward: NativeForward;
      readonly opened: Map<string, unknown>;
      readonly ctx: Context;
    },
  ) {
    this.ports.forward.idle = async (id): Promise<void> => {
      if (this.ports.opened.has(id)) {
        await runtime.get(id).flush();
        return;
      }
      const session = this.ports.ctx.sessions.get(SessionId(id));
      if (session !== undefined) await this.ports.ctx.sessions.flush(session);
    };
    recordHelperSettlement(ports.ctx, persistence);
    this.ports.forward.workFor = (id): AiHarnessSession['work'] => this.workFor(id);
    ports.ctx.on('agent/created', async ({ agent }) => {
      await this.register(agent.id);
      return undefined;
    });
    ports.ctx.on('agent/disposed', ({ agent }) => {
      if (this.implicit.delete(agent.id)) ports.forward.close(agent.id);
    });
  }
  private workFor(id: string): AiHarnessSession['work'] {
    const work = this.runtime.observedWork(id);
    return work === undefined ? [] : [...projectHarnessWork(id, work), ...this.work(id)];
  }
  private async register(id: string): Promise<void> {
    if (this.ports.opened.has(id)) return;
    const claim = this.persistence.boundClaim(id);
    if (claim === undefined) return;
    const { origin, parentSession } = LINEAGE.parse((await this.persistence.metadata(id)).header);
    if (origin !== 'subagent' || parentSession === undefined) return;
    if (this.persistence.boundClaim(id)?.epoch !== claim.epoch) return;
    this.implicit.add(id);
    await this.ports.forward.open({ claim });
  }

  isLive(id: string): boolean {
    return this.liveAgent(id) !== undefined;
  }

  liveAgent(id: string): Agent | undefined {
    return this.implicit.has(id) ? this.ports.ctx.agents.get(SessionId(id)) : undefined;
  }

  async opened(id: string): Promise<void> {
    const header = LINEAGE.parse((await this.persistence.metadata(id)).header);
    if (header.origin !== 'subagent' || header.parentSession === undefined) return;
    if (header.parentSession === id || this.descendants(id).includes(header.parentSession))
      throw new Error('Native child lineage contains a cycle.');
    this.parents.set(id, header.parentSession);
  }
  event(event: HarnessRuntimeEvent): void {
    this.catalog(event);
    if (event.kind !== 'status') return;
    if (event.status === 'running') this.working.add(event.sessionId);
    else this.working.delete(event.sessionId);
    this.propagate(event.sessionId);
  }

  private propagate(child: string): void {
    let parent = this.parents.get(child) ?? this.delegated.get(child);
    while (parent !== undefined) {
      if (this.ports.opened.has(parent))
        this.ports.forward.event({
          kind: 'status',
          sessionId: parent,
          status: this.runtime.get(parent).work().turn ? 'running' : 'idle',
        });
      parent = this.parents.get(parent) ?? this.delegated.get(parent);
    }
  }

  private catalog(event: HarnessRuntimeEvent): void {
    if (event.kind !== 'session' || event.event.type !== 'subagent/catalog') return;
    const entry = CATALOGED.safeParse(event.event.data);
    if (!entry.success) return;
    this.delegated.set(entry.data.childId, event.sessionId);
    if (this.working.has(entry.data.childId)) this.propagate(entry.data.childId);
  }

  work(id: string): AiHarnessSession['work'] {
    return [
      ...this.descendants(id).flatMap((child): AiHarnessSession['work'] => {
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
      }),
      ...this.delegatedWork(id),
    ];
  }

  private delegatedWork(id: string): AiHarnessSession['work'] {
    return [...this.working]
      .filter((child) => this.rootOf(child) === id)
      .map((child) => ({
        kind: 'child' as const,
        id: child,
        reason: 'A subagent of this session has not settled.',
      }));
  }

  private rootOf(child: string): string | undefined {
    let cursor = this.delegated.get(child);
    while (cursor !== undefined && this.delegated.has(cursor)) cursor = this.delegated.get(cursor);
    return cursor;
  }

  async settle(id: string, mode: 'close' | 'interrupt'): Promise<void> {
    for (const child of this.descendants(id)) {
      const session = this.runtime.get(child);
      if (mode === 'interrupt') await session.interrupt();
      else await session.drain();
      await this.ports.forward.flush(child);
      if (mode === 'close') {
        await this.runtime.close(child);
        this.persistence.lose(child);
        this.ports.forward.close(child);
        this.ports.opened.delete(child);
        this.parents.delete(child);
      }
    }
  }
  closed(id: string): void {
    this.parents.delete(id);
    this.delegated.delete(id);
    this.working.delete(id);
    for (const [child, parent] of this.delegated)
      if (parent === id) {
        this.delegated.delete(child);
        this.working.delete(child);
      }
  }
  private descendants(id: string): string[] {
    return [...this.parents]
      .filter(([, parent]) => parent === id)
      .flatMap(([child]) => [...this.descendants(child), child]);
  }
}
