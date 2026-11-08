import type { HubLayout, NodeLayout } from '../data-layout';

export interface ClaudeSites {
  readonly directory: string;
  readonly ready: string;
  readonly home: string | null;
}

export function hubClaudeSites(layout: HubLayout): ClaudeSites {
  return {
    directory: layout.system.ai.claude,
    ready: layout.system.run.ready,
    home: layout.system.ai.claudeHome,
  };
}

export function nodeClaudeSites(node: NodeLayout): ClaudeSites {
  return { directory: node.claudeHost, ready: node.ready, home: null };
}
