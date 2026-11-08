import { useEffect, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { GraphFlowEdge, GraphFlowNode } from './graph-canvas-types';
import { needsReveal } from './keyboard/graph-nav';

export function useRevealNode(root: RefObject<HTMLElement | null>): (id: string) => void {
  const flow = useReactFlow<GraphFlowNode, GraphFlowEdge>();
  return useStableCallback((id: string): void => {
    const node = flow.getInternalNode(id);
    const element = root.current;
    if (node === undefined || element === null) return;
    const { width, height } = element.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const box = {
      x: node.internals.positionAbsolute.x,
      y: node.internals.positionAbsolute.y,
      w: node.measured.width ?? node.data.scene.w,
      h: node.measured.height ?? node.data.scene.h,
    };
    const viewport = flow.getViewport();
    if (!needsReveal(box, viewport, { width, height })) return;
    background(
      flow.setCenter(box.x + box.w / 2, box.y + box.h / 2, { zoom: viewport.zoom }),
      'automations.canvas.reveal',
    );
  });
}

export function useRevealSelection(
  root: RefObject<HTMLElement | null>,
  selection: readonly string[],
): void {
  const reveal = useRevealNode(root);
  const [first] = selection;
  useEffect(() => {
    const element = root.current;
    if (first === undefined || element === null) return undefined;
    reveal(first);
    const observer = new ResizeObserver(() => {
      reveal(first);
    });
    observer.observe(element);
    return (): void => {
      observer.disconnect();
    };
  }, [root, first, reveal]);
}
