import {
  API_ENDPOINTS,
  MCP_ROUTES,
  isMcpToolName,
  mcpToolOperation,
  type EndpointName,
} from '@smarteverything/domain';
import { isEndpointName } from './operation-shape';
import { ToolError } from './registry';

const SUGGESTIONS_SHOWN = 8;
const WORD_LENGTH_MIN = 3;

function squashed(text: string): string {
  return text.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

const BY_SQUASHED: ReadonlyMap<string, EndpointName> = new Map(
  Object.keys(API_ENDPOINTS)
    .filter(isEndpointName)
    .map((name) => [squashed(name), name]),
);

function viaTool(name: string): EndpointName | undefined {
  const route = isMcpToolName(name) ? MCP_ROUTES.get(name) : undefined;
  return mcpToolOperation(route !== undefined && 'part' in route ? route.part : name);
}

function suggestionsFor(name: string): string {
  const words = name
    .split(/[^a-z0-9]+/i)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= WORD_LENGTH_MIN);
  const near = [...BY_SQUASHED]
    .filter(([key]) => words.some((word) => key.includes(word)))
    .map(([, operation]) => operation)
    .slice(0, SUGGESTIONS_SHOWN);
  return near.length === 0
    ? 'list_operations with search finds an operation by words'
    : `did you mean ${near.join(', ')}`;
}

export function operationNamed(name: string): EndpointName {
  const exact = isEndpointName(name) ? name : undefined;
  const found = exact ?? BY_SQUASHED.get(squashed(name)) ?? viaTool(name);
  if (found === undefined) {
    throw new ToolError(
      `There is no operation ${name}: operation names are camelCase like listClaudeSessions; ${suggestionsFor(name)}`,
      'not_found',
    );
  }
  return found;
}
