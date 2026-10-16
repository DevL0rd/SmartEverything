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
import { HarnessAdmission } from '../host/admission';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessPluginReadiness } from '../composition/configuration';
import { nativeReferenceCatalogue, exactReferenceItem } from './catalogue';
import { NativeDeviceReferenceScan, resolveDeviceReference } from './device';
import { referenceHash } from './identity';

export class NativeReferences {
  private generation = 0;
  private readonly cursors = new NativeReferenceCursors();
  private readonly admission = new HarnessAdmission();
  constructor(
    private readonly ctx: Context,
    private readonly binding: (id: string) => AiHarnessStorageBinding | undefined,
    private readonly readiness: () => readonly HarnessPluginReadiness[],
  ) {
    ctx.on('skills/change', (): void => {
      this.generation += 1;
    });
    ctx.effect(() => (): Promise<void> => this.close());
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
  execute(
    id: string,
    input: AiNativeReferenceAction,
    signal?: AbortSignal,
  ): Promise<AiNativeReferenceResult> {
    return this.admission.run(() => this.run(id, input, signal));
  }
  private async run(
    id: string,
    input: AiNativeReferenceAction,
    signal?: AbortSignal,
  ): Promise<AiNativeReferenceResult> {
    const agent = this.agent(id);
    if (input.action === 'close') {
      await this.cursors.release(input.cursor, id);
      return emptyResult();
    }
    if (input.action === 'resolve') {
      await this.resolveDirect(id, input.references, signal);
      return emptyResult();
    }
    const scope = referenceHash({
      id,
      search: { ...input.search, cursor: undefined, limit: undefined },
      binding: this.binding(id),
    });
    const progress =
      input.search.cursor === undefined
        ? await this.open(agent, input.search, scope)
        : this.cursors.take(input.search.cursor, scope);
    try {
      const result = await progress.next(input.search.limit, signal);
      if (!result.incomplete) {
        await progress.close();
        return result;
      }
      return { ...result, next_cursor: this.cursors.keep(id, progress) };
    } catch (error) {
      await progress.close();
      throw error;
    }
  }
  private async open(
    agent: Agent,
    request: AiReferenceSearch,
    scope: string,
  ): Promise<NativeReferenceProgress> {
    const kind = request.kinds?.[0];
    if (kind === undefined || request.kinds?.length !== 1)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Native reference search requires one exact source kind.',
      );
    if (kind === 'device_path') return this.device(agent.id, request, scope);
    if (request.container !== undefined || request.directory !== undefined)
      return { scope, next: () => Promise.resolve(emptyResult()), close: () => Promise.resolve() };
    return this.registry(agent, request, scope, kind);
  }
  private async registry(
    agent: Agent,
    request: AiReferenceSearch,
    scope: string,
    kind: AiReference['kind'],
  ): Promise<NativeReferenceProgress> {
    const catalogue = await nativeReferenceCatalogue(this.ctx, agent, kind, {
      generation: this.generation,
      readiness: this.readiness(),
    });
    if (!catalogue.complete)
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'Native skill discovery is incomplete; authoritative selection is unavailable.',
      );
    let index = 0;
    return {
      scope,
      close: () => Promise.resolve(),
      next: async (limit, signal): Promise<AiNativeReferenceResult> => {
        const current = await nativeReferenceCatalogue(this.ctx, agent, kind, {
          generation: this.generation,
          readiness: this.readiness(),
          signal,
        });
        if (current.revision !== catalogue.revision)
          throw new HarnessRuntimeError(
            'capability_unsupported',
            'Native reference registry changed; select again.',
          );
        const page = this.registryPage(catalogue, request, limit, index);
        index = page.position;
        return page.result;
      },
    };
  }
  private registryPage(
    catalogue: Awaited<ReturnType<typeof nativeReferenceCatalogue>>,
    request: AiReferenceSearch,
    limit: number,
    position: number,
  ): { readonly result: AiNativeReferenceResult; readonly position: number } {
    let index = position;
    const items: AiNativeReferenceResult['items'] = [];
    for (
      let examined = 0;
      examined < 128 && index < catalogue.items.length && items.length < limit;
      examined += 1
    ) {
      const item = catalogue.items[index];
      index += 1;
      if (
        item !== undefined &&
        `${item.label} ${item.subtitle}`
          .toLocaleLowerCase()
          .includes(request.query.toLocaleLowerCase())
      )
        items.push(item);
    }
    return {
      position: index,
      result: {
        items,
        revision: catalogue.revision,
        next_cursor: null,
        incomplete: index < catalogue.items.length,
      },
    };
  }
  private async device(
    id: string,
    request: AiReferenceSearch,
    scope: string,
  ): Promise<NativeReferenceProgress> {
    const binding = this.binding(id);
    if (binding?.kind !== 'device')
      throw new HarnessRuntimeError(
        'directory_unavailable',
        'Device references require the selected machine primary folder.',
      );
    const scan = await NativeDeviceReferenceScan.open(this.ctx, binding, request);
    return {
      scope,
      close: () => scan.close(),
      next: async (limit, signal): Promise<AiNativeReferenceResult> => {
        if (JSON.stringify(this.binding(id)) !== JSON.stringify(binding))
          throw new HarnessRuntimeError(
            'directory_unavailable',
            'Device binding changed during reference search.',
          );
        const page = await scan.next(limit, signal);
        return {
          items: [...page.items],
          revision: scan.revision(),
          next_cursor: null,
          incomplete: !page.complete,
        };
      },
    };
  }
  resolve(id: string, references: readonly AiReference[], signal?: AbortSignal): Promise<void> {
    return this.admission.run(() => this.resolveDirect(id, references, signal));
  }
  private async resolveDirect(
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
        generation: this.generation,
        readiness: this.readiness(),
        signal,
      });
      if (!catalogue.complete || exactReferenceItem(catalogue.items, reference) === undefined)
        throw new HarnessRuntimeError(
          'capability_unsupported',
          'Selected reference is no longer the exact effective native registry item.',
        );
    }
  }
  closeSession(id: string): Promise<void> {
    return this.admission.cleanup(() => this.cursors.releaseOwner(id));
  }
  skillGeneration(): number {
    return this.generation;
  }
  close(): Promise<void> {
    return this.admission.shutdown(() => this.cursors.close());
  }
}
function emptyResult(): AiNativeReferenceResult {
  return { items: [], revision: 'no-native-metadata', next_cursor: null, incomplete: false };
}
