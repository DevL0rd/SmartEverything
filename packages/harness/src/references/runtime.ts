import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type {
  AiHarnessStorageBinding,
  AiNativeReferenceAction,
  AiNativeReferenceResult,
  AiReference,
  AiReferenceSearch,
} from '@smarteverything/domain';
import { NativeReferenceCursors, type NativeReferenceProgress } from './cursors';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessPluginReadiness } from '../composition/configuration';
import { nativeReferenceCatalogue, findReferenceItem } from './catalogue';
import { NativeDeviceReferenceScan, resolveDeviceReference } from './device';
import { referenceHash } from './identity';

interface Opening {
  readonly agent: Agent;
  readonly request: AiReferenceSearch;
  readonly scope: string;
  readonly signal?: AbortSignal | undefined;
}

export class NativeReferences {
  private readonly cursors = new NativeReferenceCursors();
  constructor(
    private readonly ctx: Context,
    private readonly binding: (id: string) => AiHarnessStorageBinding | undefined,
    private readonly readiness: () => readonly HarnessPluginReadiness[],
  ) {
    ctx.effect(() => (): void => {
      this.close();
    });
  }
  private agent(id: string): Agent {
    const agent = this.ctx.agents.get(SessionId(id));
    if (agent === undefined)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'References require the exact opened native agent.',
      );
    return agent;
  }
  async execute(
    id: string,
    input: AiNativeReferenceAction,
    signal?: AbortSignal,
  ): Promise<AiNativeReferenceResult> {
    const agent = this.agent(id);
    if (input.action === 'close') {
      this.cursors.release(input.cursor, id);
      return emptyResult();
    }
    if (input.action === 'resolve') {
      await this.resolve(id, input.references, signal);
      return emptyResult();
    }
    const scope = referenceHash({
      id,
      search: { ...input.search, cursor: undefined, limit: undefined },
      binding: this.binding(id),
    });
    const progress =
      input.search.cursor === undefined
        ? await this.open({ agent, request: input.search, scope, signal })
        : this.cursors.take(input.search.cursor, scope);
    const result = await progress.next(input.search.limit, signal);
    return result.incomplete ? { ...result, next_cursor: this.cursors.keep(id, progress) } : result;
  }
  private async open(opening: Opening): Promise<NativeReferenceProgress> {
    const { request, scope } = opening;
    if (request.kinds === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Native reference search requires its source kinds.',
      );
    const progresses = await Promise.all(request.kinds.map((kind) => this.source(opening, kind)));
    const [only] = progresses;
    return only !== undefined && progresses.length === 1 ? only : merged(scope, progresses);
  }
  private source(opening: Opening, kind: AiReference['kind']): Promise<NativeReferenceProgress> {
    if (kind === 'device_path') return this.device(opening);
    if (opening.request.container !== undefined || opening.request.directory !== undefined)
      return Promise.resolve({ scope: opening.scope, next: () => Promise.resolve(emptyResult()) });
    return this.registry(opening, kind);
  }
  private async registry(
    opening: Opening,
    kind: AiReference['kind'],
  ): Promise<NativeReferenceProgress> {
    const { agent, request, scope, signal } = opening;
    const catalogue = await nativeReferenceCatalogue(this.ctx, agent, kind, {
      readiness: this.readiness(),
      signal,
    });
    const query = request.query.toLocaleLowerCase();
    const matches = catalogue.items.filter((item) =>
      `${item.label} ${item.subtitle}`.toLocaleLowerCase().includes(query),
    );
    let position = 0;
    return {
      scope,
      next: (limit): Promise<AiNativeReferenceResult> => {
        const items = matches.slice(position, position + limit);
        position += items.length;
        return Promise.resolve({
          items,
          revision: catalogue.revision,
          next_cursor: null,
          incomplete: position < matches.length,
        });
      },
    };
  }
  private async device(opening: Opening): Promise<NativeReferenceProgress> {
    const { agent, request, scope, signal } = opening;
    const binding = this.binding(agent.id);
    if (binding?.kind !== 'device')
      throw new HarnessRuntimeError(
        'directory_unavailable',
        'Device references require the selected machine primary folder.',
      );
    const scan = await NativeDeviceReferenceScan.open(this.ctx, binding, request, signal);
    return {
      scope,
      next: async (limit, nextSignal): Promise<AiNativeReferenceResult> => {
        const page = await scan.next(limit, nextSignal);
        return {
          items: [...page.items],
          revision: scan.revision(),
          next_cursor: null,
          incomplete: !page.complete,
        };
      },
    };
  }
  async resolve(
    id: string,
    references: readonly AiReference[],
    signal?: AbortSignal,
  ): Promise<void> {
    const agent = this.agent(id);
    for (const reference of references) {
      signal?.throwIfAborted();
      if (reference.kind === 'managed_path' || reference.kind === 'chat') continue;
      if (reference.kind === 'device_path') {
        const binding = this.binding(id);
        if (binding?.kind !== 'device')
          throw new HarnessRuntimeError(
            'directory_unavailable',
            'Device reference has no exact selected workspace.',
          );
        await resolveDeviceReference(this.ctx, binding, reference, signal);
        continue;
      }
      const catalogue = await nativeReferenceCatalogue(this.ctx, agent, reference.kind, {
        readiness: this.readiness(),
        signal,
      });
      if (findReferenceItem(catalogue.items, reference) === undefined)
        throw new HarnessRuntimeError(
          'capability_unsupported',
          'The selected reference is no longer available.',
        );
    }
  }
  closeSession(id: string): void {
    this.cursors.releaseOwner(id);
  }
  close(): void {
    this.cursors.clear();
  }
}
function merged(
  scope: string,
  progresses: readonly NativeReferenceProgress[],
): NativeReferenceProgress {
  return {
    scope,
    next: async (limit, signal): Promise<AiNativeReferenceResult> => {
      const quota = Math.max(1, Math.floor(limit / progresses.length));
      const first = await Promise.all(progresses.map((progress) => progress.next(quota, signal)));
      const pages = [...first];
      let room = limit - first.reduce((sum, page) => sum + page.items.length, 0);
      for (const [index, progress] of progresses.entries()) {
        const page = pages[index];
        if (room <= 0 || page?.incomplete !== true) continue;
        const more = await progress.next(room, signal);
        pages[index] = { ...more, items: [...page.items, ...more.items] };
        room -= more.items.length;
      }
      return {
        items: pages.flatMap((page) => page.items),
        revision: referenceHash(pages.map((page) => page.revision)),
        next_cursor: null,
        incomplete: pages.some((page) => page.incomplete),
      };
    },
  };
}
function emptyResult(): AiNativeReferenceResult {
  return { items: [], revision: 'no-native-metadata', next_cursor: null, incomplete: false };
}
