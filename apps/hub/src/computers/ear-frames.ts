import type { NodeFrame } from '@smarteverything/domain';
import type { SessionEarHosts } from '../listening/ear-hosts';
import type { SessionEars } from './computer-ears';

export type EarFrame = Extract<
  NodeFrame,
  { readonly type: 'ear' | 'ears' | 'ears_scored' | 'ears_score_failed' }
>;

export interface EarRoutes {
  readonly ears?: SessionEars;
  readonly earHosts?: SessionEarHosts;
}

export function isEarFrame(frame: NodeFrame): frame is EarFrame {
  return (
    frame.type === 'ear' ||
    frame.type === 'ears' ||
    frame.type === 'ears_scored' ||
    frame.type === 'ears_score_failed'
  );
}

export function routeEarFrame(routes: EarRoutes, computerId: string | null, frame: EarFrame): void {
  if (computerId === null) return;
  switch (frame.type) {
    case 'ear':
      routes.ears?.heard(computerId, frame.ear);
      return;
    case 'ears':
      routes.earHosts?.relayed(computerId, frame.key, frame.ear);
      return;
    case 'ears_scored':
      routes.earHosts?.scored(computerId, frame.id, frame.heard);
      return;
    case 'ears_score_failed':
      routes.earHosts?.scoreFailed(computerId, frame.id, frame.reason);
      return;
  }
}
