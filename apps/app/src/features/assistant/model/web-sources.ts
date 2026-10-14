import {
  WEB_SOURCES_EMBED,
  type AssistantMessageRow,
  type WebSource,
} from '@smarteverything/domain';
import type { InlineTimelinePart } from './inline-timeline';

export interface NumberedSource {
  readonly number: number;
  readonly source: WebSource;
}
const PARSED = new WeakMap<AssistantMessageRow['embeds'], readonly NumberedSource[]>();

export function webSourcesOf(row: AssistantMessageRow): readonly NumberedSource[] {
  const known = PARSED.get(row.embeds);
  if (known !== undefined) return known;
  const parsed = row.embeds.map((embed) => WEB_SOURCES_EMBED.safeParse(embed));
  const found = parsed.find((entry) => entry.success);
  const sources =
    found?.success === true
      ? found.data.sources.map((source, index) => ({ number: index + 1, source }))
      : [];
  PARSED.set(row.embeds, sources);
  return sources;
}

function outputMentionsUrl(output: string | null, url: string): boolean {
  if (output === null) return false;
  let offset = output.indexOf(url);
  while (offset >= 0) {
    const before = offset === 0 ? '' : output.charAt(offset - 1);
    const after = output.charAt(offset + url.length);
    if (/^[\s"'<([\]]?$/.test(before) && /^[\s"'>),}\]]?$/.test(after)) return true;
    offset = output.indexOf(url, offset + url.length);
  }
  return false;
}

export function timelineSources(
  parts: readonly InlineTimelinePart[],
  sources: readonly NumberedSource[],
): {
  readonly groups: ReadonlyMap<string, readonly NumberedSource[]>;
  readonly remaining: readonly NumberedSource[];
} {
  const groups = new Map<string, readonly NumberedSource[]>();
  const remaining: NumberedSource[] = [];
  for (const source of sources) {
    const group = parts.find(
      (part) =>
        part.kind === 'tools' &&
        part.tools.some((tool) => outputMentionsUrl(tool.output, source.source.url)),
    );
    if (group === undefined) remaining.push(source);
    else groups.set(group.key, [...(groups.get(group.key) ?? []), source]);
  }
  return { groups, remaining };
}
