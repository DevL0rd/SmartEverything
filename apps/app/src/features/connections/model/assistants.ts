import type { Brand } from '../../../components/brand-glyphs';

type AssistantKey = 'claude' | 'chatgpt' | 'cursor' | 'vscode' | 'other';

export interface OAuthAssistant {
  readonly key: AssistantKey;
  readonly kind: 'oauth';
  readonly name: string;
  readonly brand: Brand;
  readonly clientName: RegExp;
  readonly openLabel: string;
  readonly reach: string;
  readonly open: (mcpUrl: string) => string;
}

export interface TokenAssistant {
  readonly key: AssistantKey;
  readonly kind: 'token';
  readonly name: string;
  readonly brand: Brand;
  readonly snippetLabel: string;
  readonly snippet: (mcpUrl: string, token: string) => string;
  readonly install: ((mcpUrl: string, token: string) => string) | null;
}

export type Assistant = OAuthAssistant | TokenAssistant;

const SERVER_NAME = 'smarteverything';

function headers(token: string): Readonly<Record<string, string>> {
  return { Authorization: `Bearer ${token}` };
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export const ASSISTANTS: readonly Assistant[] = [
  {
    key: 'claude',
    kind: 'oauth',
    name: 'Claude',
    brand: 'claude',
    clientName: /claude/i,
    openLabel: 'Open Claude',
    reach: 'Works in Claude on the web, desktop and phone.',
    open: (mcpUrl) =>
      `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=SmartEverything&connectorUrl=${encodeURIComponent(mcpUrl)}`,
  },
  {
    key: 'chatgpt',
    kind: 'oauth',
    name: 'ChatGPT',
    brand: 'chatgpt',
    clientName: /chatgpt|openai/i,
    openLabel: 'Open ChatGPT',
    reach: 'Works in ChatGPT on the web, desktop and phone.',
    open: () => 'https://chatgpt.com/#settings/Connectors',
  },
  {
    key: 'cursor',
    kind: 'token',
    name: 'Cursor',
    brand: 'cursor',
    snippetLabel: 'Add to ~/.cursor/mcp.json',
    snippet: (url, token) =>
      pretty({ mcpServers: { [SERVER_NAME]: { url, headers: headers(token) } } }),
    install: (url, token) =>
      `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(btoa(JSON.stringify({ url, headers: headers(token) })))}`,
  },
  {
    key: 'vscode',
    kind: 'token',
    name: 'VS Code',
    brand: 'vscode',
    snippetLabel: 'Add to .vscode/mcp.json',
    snippet: (url, token) =>
      pretty({ servers: { [SERVER_NAME]: { type: 'http', url, headers: headers(token) } } }),
    install: (url, token) =>
      `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: SERVER_NAME, type: 'http', url, headers: headers(token) }))}`,
  },
  {
    key: 'other',
    kind: 'token',
    name: 'Other app',
    brand: 'mcp',
    snippetLabel: 'MCP server settings',
    snippet: (url, token) =>
      pretty({ mcpServers: { [SERVER_NAME]: { type: 'http', url, headers: headers(token) } } }),
    install: null,
  },
];

export function assistantOf(key: string): Assistant | null {
  return ASSISTANTS.find((assistant) => assistant.key === key) ?? null;
}

export function tokenNameFor(assistant: TokenAssistant, clientName: string): string {
  return `${assistant.name} on ${clientName}`.slice(0, 80);
}

export function ownsToken(assistant: TokenAssistant, tokenName: string): boolean {
  return tokenName.startsWith(`${assistant.name} on `);
}
