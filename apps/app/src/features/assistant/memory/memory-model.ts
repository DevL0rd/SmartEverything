import type { AiMemory, AiMemoryKind, AiMemoryList, AiMemoryScope } from '@smarteverything/domain';

export interface ScopeCopy {
  readonly title: string;
  readonly empty: string;
  readonly footer: string;
  readonly forgetTitle: string;
  readonly forgetBody: string;
}

export const SCOPE_COPY: Readonly<Record<AiMemoryScope, ScopeCopy>> = {
  person: {
    title: 'My memories',
    empty: 'Nothing yet. Facts the AI learns about you in chats appear here.',
    footer: 'Only you and the AI working for you can see these.',
    forgetTitle: 'Forget everything about you?',
    forgetBody: 'Every memory in My memories is deleted. This can’t be undone.',
  },
  home: {
    title: 'Home',
    empty: 'Nothing yet. Facts that apply to the whole home appear here.',
    footer: 'Everyone in the home shares these. Only an owner can change them.',
    forgetTitle: 'Forget everything about the home?',
    forgetBody: 'Every memory shared with the whole home is deleted. This can’t be undone.',
  },
};

export const MEMORY_SCOPES: readonly AiMemoryScope[] = ['home', 'person'];

export type MemoryOrder = 'importance' | 'newest' | 'oldest';

export const MEMORY_ORDERS: readonly { readonly value: MemoryOrder; readonly label: string }[] = [
  { value: 'importance', label: 'Importance' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

export const KIND_LABEL: Readonly<Record<AiMemoryKind, string>> = {
  fact: 'Fact',
  preference: 'Preference',
  episode: 'Episode',
  vocabulary: 'Vocabulary',
};

function age(a: AiMemory, b: AiMemory): number {
  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
}

const COMPARE: Readonly<Record<MemoryOrder, (a: AiMemory, b: AiMemory) => number>> = {
  importance: (a, b) => b.importance - a.importance || age(a, b),
  newest: age,
  oldest: (a, b) => age(b, a),
};

export function sortMemories(
  memories: readonly AiMemory[],
  order: MemoryOrder,
): readonly AiMemory[] {
  return [...memories].sort(COMPARE[order]);
}

export function memoriesIn(
  list: AiMemoryList,
  scope: AiMemoryScope,
  order: MemoryOrder,
): readonly AiMemory[] {
  return sortMemories(
    list.memories.filter((memory) => memory.scope === scope),
    order,
  );
}

export function mayChange(scope: AiMemoryScope, owner: boolean): boolean {
  return scope === 'person' || owner;
}

export function promptCharsOf(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return /^\d+$/u.test(trimmed) && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
