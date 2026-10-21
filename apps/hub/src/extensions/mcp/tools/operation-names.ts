import { API_ENDPOINTS, isMcpToolName, type EndpointName } from '@smarteverything/domain';
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

function suggestionsFor(name: string): string {
  const same = BY_SQUASHED.get(squashed(name));
  if (same !== undefined) {
    return `did you mean ${same}`;
  }
  const words = name
    .split(/[^a-z0-9]+/i)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= WORD_LENGTH_MIN);
  const near = [...BY_SQUASHED]
    .filter(([key]) => words.some((word) => key.includes(word)))
    .map(([, operation]) => operation)
    .slice(0, SUGGESTIONS_SHOWN);
  return near.length === 0
    ? 'tool_search finds an operation by words'
    : `did you mean ${near.join(', ')}`;
}

export function operationNamed(name: string): EndpointName {
  if (isEndpointName(name)) {
    return name;
  }
  if (isMcpToolName(name)) {
    throw new ToolError(`${name} is a tool, not an operation: call it directly`, 'not_found');
  }
  throw new ToolError(
    `There is no operation ${name}: operation names are camelCase like listClaudeSessions; ${suggestionsFor(name)}`,
    'not_found',
  );
}
