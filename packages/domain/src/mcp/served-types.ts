import type { McpToolAccess, McpToolArea } from './areas';
import type { McpPartName } from './names';

export interface McpBranch {
  readonly part: McpPartName;
  readonly line: string;
}

export type McpSelector = 'action' | 'view';

export type McpRoute =
  | { readonly part: McpPartName }
  | {
      readonly key: McpSelector;
      readonly branches: Readonly<Record<string, McpBranch>>;
      readonly default?: string;
    }
  | { readonly compose: readonly McpPartName[] }
  | { readonly custom: true };

export interface Served {
  readonly name: string;
  readonly area: McpToolArea;
  readonly access: McpToolAccess;
  readonly title: string;
  readonly line: string;
  readonly description: string;
  readonly route: McpRoute;
}
