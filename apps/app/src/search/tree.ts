import { appendTo } from '@smarteverything/domain';
import { deviceIdOf, type SearchCatalogue } from './catalogue';
import {
  addsToDevice,
  commandDrafts,
  entryDraft,
  quickDrafts,
  type Draft,
} from './device-children';
import { matchIndex, type EntryHit, type Matched } from './match';
import {
  RESULT_GROUPS,
  RESULT_GROUP_LABELS,
  groupOf,
  titleOf,
  type ResultBranch,
  type ResultGroup,
  type ResultNode,
} from './nodes';
import { compareText } from '../format/text';

const STRONGER = 6;

function isCommand(hit: EntryHit): boolean {
  return hit.entry.group === 'action' && hit.entry.run?.kind === 'command';
}

function addAncestors(
  draft: Draft,
  drafts: Map<string, Draft>,
  tokens: readonly string[],
  catalogue: SearchCatalogue,
): void {
  let parent = draft.parent;
  while (parent !== null && !drafts.has(parent)) {
    const context = entryDraft(parent, null, tokens, catalogue);
    if (context === null) {
      return;
    }
    drafts.set(context.key, context);
    parent = context.parent;
  }
}

function hitDrafts(matched: Matched, catalogue: SearchCatalogue): Map<string, Draft> {
  const hits = [...matched.hits.values()].filter((hit) =>
    addsToDevice(hit, matched.tokens, catalogue),
  );
  const drafts = new Map<string, Draft>();
  for (const hit of hits.filter((candidate) => !isCommand(candidate))) {
    const draft = entryDraft(hit.entry.id, hit.score, matched.tokens, catalogue);
    if (draft !== null) {
      drafts.set(draft.key, draft);
    }
  }
  for (const draft of commandDrafts(hits.filter(isCommand), matched.tokens, catalogue)) {
    drafts.set(draft.key, draft);
  }
  for (const draft of [...drafts.values()]) {
    addAncestors(draft, drafts, matched.tokens, catalogue);
  }
  return drafts;
}

function nearestShown(
  draft: Draft,
  drafts: ReadonlyMap<string, Draft>,
  catalogue: SearchCatalogue,
): string | null {
  let parent = draft.parent;
  while (parent !== null && !drafts.has(parent)) {
    parent = catalogue.parents.get(parent) ?? null;
  }
  return parent;
}

function echoes(child: Draft, parent: Draft): boolean {
  return titleOf(child.item) === titleOf(parent.item);
}

function defaultsOf(draft: Draft, catalogue: SearchCatalogue): Draft[] {
  if (draft.item.kind !== 'entry') {
    return [];
  }
  const { entry } = draft.item;
  const deviceId = entry.group === 'device' ? deviceIdOf(entry) : null;
  const named = deviceId === null ? undefined : catalogue.devices.get(deviceId);
  if (named !== undefined) {
    return quickDrafts(named, catalogue);
  }
  return (catalogue.children.get(draft.key) ?? []).flatMap((id) => {
    const child = entryDraft(id, null, [], catalogue);
    const runnable = child?.item.kind === 'entry' && child.item.entry.run?.kind === 'command';
    const echo = child !== null && echoes(child, draft);
    return child === null || runnable || echo ? [] : [child];
  });
}

function nested(
  drafts: ReadonlyMap<string, Draft>,
  catalogue: SearchCatalogue,
): Map<string | null, Draft[]> {
  const children = new Map<string | null, Draft[]>();
  for (const draft of drafts.values()) {
    const parent = nearestShown(draft, drafts, catalogue);
    const above = parent === null ? undefined : drafts.get(parent);
    if (above === undefined || !echoes(draft, above)) {
      appendTo(children, parent, draft);
    }
  }
  for (const draft of drafts.values()) {
    if (draft.own !== null && !children.has(draft.key)) {
      children.set(draft.key, defaultsOf(draft, catalogue));
    }
  }
  return children;
}

function byScore(left: ResultNode, right: ResultNode): number {
  return right.score - left.score;
}

function merged(node: ResultNode): ResultNode {
  const [only] = node.children;
  const chain =
    !node.hit &&
    node.children.length === 1 &&
    only !== undefined &&
    !only.hit &&
    node.item.kind === 'entry' &&
    only.item.kind === 'entry';
  if (!chain) {
    return node;
  }
  return {
    ...only,
    item: { ...only.item, title: `${titleOf(node.item)} › ${titleOf(only.item)}` },
  };
}

function nodeOf(draft: Draft, children: ReadonlyMap<string | null, readonly Draft[]>): ResultNode {
  const kids = (children.get(draft.key) ?? [])
    .map((kid) => merged(nodeOf(kid, children)))
    .sort(byScore);
  return {
    key: draft.key,
    item: draft.item,
    score: Math.max(draft.own ?? 0, ...kids.map((kid) => kid.score)),
    hit: draft.own !== null,
    found: kids.some((kid) => kid.hit || kid.found),
    range: draft.range,
    children: kids,
  };
}

function rootGroup(node: ResultNode, catalogue: SearchCatalogue): ResultGroup {
  return node.item.kind === 'entry' ? groupOf(node.item.entry, catalogue) : 'devices';
}

function offline(node: ResultNode, catalogue: SearchCatalogue): number {
  const entry = node.item.kind === 'entry' ? node.item.entry : null;
  const deviceId = entry?.group === 'device' ? deviceIdOf(entry) : null;
  const named = deviceId === null ? undefined : catalogue.devices.get(deviceId);
  return named?.device.online === false ? 1 : 0;
}

function rankIn(catalogue: SearchCatalogue): (left: ResultNode, right: ResultNode) => number {
  return (left, right) =>
    byScore(left, right) ||
    offline(left, catalogue) - offline(right, catalogue) ||
    compareText(titleOf(left.item), titleOf(right.item));
}

function branchesOf(roots: readonly ResultNode[], catalogue: SearchCatalogue): ResultBranch[] {
  return RESULT_GROUPS.map((group) => ({
    group,
    label: RESULT_GROUP_LABELS[group],
    roots: roots.filter((root) => rootGroup(root, catalogue) === group).sort(rankIn(catalogue)),
  })).filter((branch) => branch.roots.length > 0);
}

function bestOf(branch: ResultBranch): number {
  return branch.roots[0]?.score ?? 0;
}

function named(node: ResultNode): boolean {
  return (node.hit && node.range !== null) || node.children.some(named);
}

function outranks(lead: ResultBranch, other: ResultBranch): boolean {
  const titled = lead.roots.some(named) && !other.roots.some(named);
  return titled || bestOf(lead) - bestOf(other) >= STRONGER;
}

function ordered(branches: readonly ResultBranch[]): readonly ResultBranch[] {
  const lead = branches.reduce<ResultBranch | null>(
    (best, branch) => (best === null || bestOf(branch) > bestOf(best) ? branch : best),
    null,
  );
  if (lead === null) {
    return branches;
  }
  const ahead = branches.slice(0, branches.indexOf(lead));
  const clear = ahead.every((branch) => outranks(lead, branch));
  return clear ? [lead, ...branches.filter((branch) => branch !== lead)] : branches;
}

export function treeOf(catalogue: SearchCatalogue, query: string): readonly ResultBranch[] {
  const matched = matchIndex(catalogue.index, query);
  if (matched.hits.size === 0) {
    return [];
  }
  const children = nested(hitDrafts(matched, catalogue), catalogue);
  const roots = (children.get(null) ?? []).map((draft) => nodeOf(draft, children));
  return ordered(branchesOf(roots, catalogue));
}
