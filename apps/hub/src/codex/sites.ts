import { join } from 'node:path';
import type { HubLayout, NodeLayout } from '../data-layout';

export interface CodexSites {
  readonly directory: string;
  readonly inputs: string;
  readonly home: string | null;
  readonly chatWorkspace: (profileId: string, chatId: string) => string;
  readonly operationWorkspace: (operationId: string) => string;
}

export function hubCodexSites(layout: HubLayout): CodexSites {
  const { codex, codexHome } = layout.system.ai;
  return {
    directory: codex,
    inputs: layout.cache.codexInputs,
    home: codexHome,
    chatWorkspace: (profileId, chatId) => layout.chat(profileId, chatId).codex,
    operationWorkspace: (operationId) => join(codex, 'workspaces', operationId),
  };
}

export function nodeCodexSites(node: NodeLayout): CodexSites {
  return {
    directory: node.codex,
    inputs: node.codexInputs,
    home: null,
    chatWorkspace: (_profileId, chatId) => join(node.codex, 'workspaces', chatId),
    operationWorkspace: (operationId) => join(node.codex, 'workspaces', operationId),
  };
}
