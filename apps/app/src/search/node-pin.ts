import type { NavPinTarget } from '@smarteverything/domain';
import { useNavPins } from '../app-shell/nav-layout';
import type { ResultNode } from './nodes';
import { pinTargetOfNode } from './pin-target';

export function pickNode(node: ResultNode, pick: (target: NavPinTarget) => void): void {
  const target = pinTargetOfNode(node);
  if (target !== null) pick(target);
}

export function useNodePin(): (node: ResultNode) => boolean {
  const pins = useNavPins();
  return (node) => {
    const target = pinTargetOfNode(node);
    if (target === null) return false;
    if (pins.isPinned(target)) pins.unpin(target);
    else pins.pin(target);
    return true;
  };
}
