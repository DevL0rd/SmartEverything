import { navTargetOfSearch, type NavPinTarget, type SearchEntry } from '@smarteverything/domain';
import { pinnableTarget } from '../app-shell/nav-targets';
import type { ResultNode } from './nodes';

function targetOf(entry: SearchEntry): NavPinTarget | null {
  const { run } = entry;
  if (run?.kind === 'scene') return { kind: 'scene', sceneId: run.sceneId };
  if (run?.kind === 'automation') {
    return { kind: 'automation', automationId: run.automationId, focus: null };
  }
  return navTargetOfSearch(entry.open);
}

export function pinTargetOfNode(node: ResultNode): NavPinTarget | null {
  if (node.item.kind !== 'entry' || node.item.entry.group === 'setting') return null;
  const target = targetOf(node.item.entry);
  return target === null ? null : pinnableTarget(target);
}
