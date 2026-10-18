import {
  AI_MESSAGE_REFERENCES,
  referencesMatchText,
  type AiMessageReference,
} from '@smarteverything/domain';

export interface ReferenceText {
  readonly text: string;
  readonly references: readonly AiMessageReference[];
}
export function adjustedReferences(
  before: string,
  after: string,
  references: readonly AiMessageReference[],
): readonly AiMessageReference[] {
  if (before === after) return references;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const shift = newEnd - oldEnd;
  return references.flatMap((item) => {
    if (item.end <= start) return [item];
    if (item.start < oldEnd || (oldEnd === start && item.start < start)) return [];
    return [{ ...item, start: item.start + shift, end: item.end + shift }];
  });
}
export function trimmedReferences(input: ReferenceText): ReferenceText {
  const text = input.text.trim();
  const offset = input.text.length - input.text.trimStart().length;
  return {
    text,
    references: input.references
      .filter((item) => item.start >= offset && item.end <= offset + text.length)
      .map((item) => ({ ...item, start: item.start - offset, end: item.end - offset })),
  };
}
export function checkedReferenceText(input: ReferenceText): ReferenceText {
  const references = AI_MESSAGE_REFERENCES.parse(input.references);
  if (!referencesMatchText(input.text, references))
    throw new ReferenceSpanError(0, input.text.length);
  return { text: input.text, references };
}
class ReferenceSpanError extends Error {
  override readonly name = 'ReferenceSpanError';
  constructor(
    readonly start: number,
    readonly end: number,
  ) {
    super('A selected reference changed. Select it again before sending.');
  }
}
