import {
  AI_MESSAGE_REFERENCES,
  AI_REFERENCE_KINDS,
  AI_REFERENCE_SEARCH,
  AI_REFERENCE_SEARCH_RESULT,
  ApiError,
  referencesMatchText,
  type AiMessageReference,
  type AiChatRow,
  type AiReference,
  type AiReferenceKind,
  type AiReferenceSearch,
  type AiReferenceSearchResult,
  type AiReferenceSourceStatus,
  type AiReferenceSummary,
} from '@smarteverything/domain';
import type { ProjectFilesService } from '../projects/service';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import { resolveChat, searchChats } from './chats';
import { referenceContext } from './context';
import type {
  NativeReferences,
  NativeSearch,
  ReferenceContext,
  ReferenceMatches,
} from './contracts';
import { resolveManaged, searchManaged } from './managed';

const LOCAL_KINDS: readonly AiReferenceKind[] = ['managed_path', 'chat'];

export class ReferenceService {
  private readonly natives = new Map<AiChatRow['engine']['kind'], NativeReferences>();
  constructor(
    private readonly store: Store,
    private readonly projects: ProjectFilesService,
  ) {}
  attachNative(engines: readonly AiChatRow['engine']['kind'][], native: NativeReferences): void {
    for (const engine of engines) this.natives.set(engine, native);
  }
  async search(
    caller: Caller,
    chatId: string,
    input: AiReferenceSearch,
  ): Promise<AiReferenceSearchResult> {
    const request = AI_REFERENCE_SEARCH.parse(input);
    const context = referenceContext(this.store, caller, chatId, request);
    context.validate();
    const kinds = searchedKinds(context.chat, request);
    const nativeKinds = kinds.filter((kind) => !LOCAL_KINDS.includes(kind));
    const [local, native] = await Promise.all([
      Promise.all(
        kinds
          .filter((kind) => LOCAL_KINDS.includes(kind))
          .map(async (kind) => ({ kind, matches: await this.local(context, request, kind) })),
      ),
      this.nativeSearch(context, request, nativeKinds),
    ]);
    const groups = [
      ...local.map(({ kind, matches }) => ({ kind, items: matches.items })),
      ...nativeKinds.map((kind) => ({
        kind,
        items: native.matches.items.filter((item) => item.reference.kind === kind),
      })),
    ];
    const sources = kinds.map((kind) => sourceOf(kind, native.sources));
    const searched = sources.filter((source) => source.state === 'available');
    const quota = Math.max(1, Math.floor(request.limit / Math.max(1, searched.length)));
    const items = fill(
      searched.map((source) => groups.find((group) => group.kind === source.kind)?.items ?? []),
      quota,
      request.limit,
    );
    return AI_REFERENCE_SEARCH_RESULT.parse({
      items,
      sources,
      next_cursor: null,
      incomplete: native.matches.incomplete || local.some(({ matches }) => matches.incomplete),
    });
  }
  async resolve(
    caller: Caller,
    chatId: string,
    text: string,
    input: readonly AiMessageReference[],
  ): Promise<AiMessageReference[]> {
    const references = AI_MESSAGE_REFERENCES.parse(input);
    if (!referencesMatchText(text, references))
      throw new ApiError(
        'invalid_request',
        'Reference tokens were edited; select their exact identities again.',
      );
    if (references.length === 0) return references;
    const context = referenceContext(this.store, caller, chatId);
    const native: AiReference[] = [];
    const central = context.chat.engine.kind !== 'claude';
    for (const { reference } of references) {
      if (central && reference.kind === 'managed_path')
        await resolveManaged(this.projects, context, reference);
      else if (central && reference.kind === 'chat') resolveChat(this.store, context, reference);
      else native.push(reference);
    }
    if (native.length > 0) await this.nativeSupport(context.chat).admit(context, native);
    context.validate();
    return references;
  }
  private local(
    context: ReferenceContext,
    request: AiReferenceSearch,
    kind: AiReferenceKind,
  ): Promise<ReferenceMatches> {
    if (kind === 'managed_path') return searchManaged(this.projects, context, request);
    return Promise.resolve(searchChats(this.store, context, request));
  }
  private async nativeSearch(
    context: ReferenceContext,
    request: AiReferenceSearch,
    kinds: readonly AiReferenceKind[],
  ): Promise<NativeSearch> {
    if (kinds.length === 0) return { sources: [], matches: { items: [], incomplete: false } };
    const native = this.natives.get(context.chat.engine.kind);
    if (native === undefined)
      return {
        sources: kinds.map((kind) => ({
          kind,
          state: 'unavailable',
          reason: 'The current runtime has not negotiated effective reference metadata support.',
        })),
        matches: { items: [], incomplete: false },
      };
    return native.search(context, request, kinds);
  }
  private nativeSupport(chat: AiChatRow): NativeReferences {
    const native = this.natives.get(chat.engine.kind);
    if (native === undefined)
      throw new ApiError(
        'conflict',
        'This runtime cannot consume structured references yet; no message was submitted.',
      );
    return native;
  }
}

function searchedKinds(chat: AiChatRow, request: AiReferenceSearch): readonly AiReferenceKind[] {
  const wanted = request.kinds ?? AI_REFERENCE_KINDS;
  return chat.engine.kind === 'claude' ? wanted.filter((kind) => kind === 'device_path') : wanted;
}

function sourceOf(
  kind: AiReferenceKind,
  native: readonly AiReferenceSourceStatus[],
): AiReferenceSourceStatus {
  return native.find((source) => source.kind === kind) ?? { kind, state: 'available' };
}

function fill(
  groups: readonly (readonly AiReferenceSummary[])[],
  quota: number,
  limit: number,
): AiReferenceSummary[] {
  const taken = groups.map((group) => group.slice(0, quota));
  const spare = groups.flatMap((group) => group.slice(quota));
  const room = Math.max(0, limit - taken.reduce((sum, group) => sum + group.length, 0));
  return [...taken.flat(), ...spare.slice(0, room)].slice(0, limit);
}
