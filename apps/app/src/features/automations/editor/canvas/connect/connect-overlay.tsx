import { useState, type ReactNode } from 'react';
import type { EdgeEnd } from '../../../model/graph/scene-contract';
import type { Shown } from './connect-toast';
import { armedHint, type NamedNode } from './tap-to-connect';

export function useArmedAnnouncement(
  armed: EdgeEnd | null,
  nodes: readonly NamedNode[],
  announce: (text: string) => void,
): void {
  const [seen, setSeen] = useState<EdgeEnd | null>(armed);
  if (seen === armed) return;
  setSeen(armed);
  if (armed !== null) announce(armedHint(nodes, armed));
}

export function ConnectHint({
  armed,
  nodes,
}: {
  readonly armed: EdgeEnd | null;
  readonly nodes: readonly NamedNode[];
}): ReactNode {
  if (armed === null) return null;
  return (
    <div className="gc-hint" aria-hidden>
      {armedHint(nodes, armed)}
    </div>
  );
}

export function ConnectToast({ toast }: { readonly toast: Shown | null }): ReactNode {
  if (toast === null) return null;
  return (
    <div key={toast.seq} className="gc-toast" aria-hidden>
      {toast.text}
    </div>
  );
}
