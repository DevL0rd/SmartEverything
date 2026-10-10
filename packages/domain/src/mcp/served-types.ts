import type { McpToolAccess, McpToolArea } from './areas';
import type { McpPartName } from './names';

export type McpRoute =
  | { readonly part: McpPartName }
  | { readonly key: string; readonly parts: Readonly<Record<string, McpPartName>> }
  | { readonly compose: readonly McpPartName[] }
  | { readonly custom: true };

export type Served = readonly [
  name: string,
  area: McpToolArea,
  access: McpToolAccess,
  title: string,
  description: string,
  route: McpRoute,
];
