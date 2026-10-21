import {
  API_ENDPOINTS,
  MCP_HUMAN_ONLY_OPERATIONS,
  MCP_OPERATION_TOOLS,
  MCP_UNAVAILABLE_OPERATIONS,
  endpointAccessArea,
  mcpOperationArea,
  mcpOperationTraits,
  type EndpointName,
  type McpToolArea,
} from '@smarteverything/domain';
import type { OperationLookup } from '../../../ai-tools/tool-discovery';
import { operationNamed } from './operation-names';
import { CALLABLE_OPERATIONS, isEndpointName, operationShape } from './operation-shape';
import { READS, REMOVES, ToolError, WRITES, jsonSchemaOf, type ToolAnnotations } from './registry';

export type OperationScope = (area: McpToolArea | null) => boolean;

function annotationsByMethod(name: EndpointName): ToolAnnotations {
  switch (API_ENDPOINTS[name].method) {
    case 'GET':
      return READS;
    case 'DELETE':
      return REMOVES;
    case 'PUT':
      return { ...WRITES, idempotentHint: true };
    case 'POST':
    case 'PATCH':
      return WRITES;
  }
}

export function operationAnnotations(name: EndpointName): ToolAnnotations {
  return { ...annotationsByMethod(name), ...mcpOperationTraits(name).hints };
}

const DEDICATED: ReadonlyMap<string, string> = new Map(
  MCP_OPERATION_TOOLS.map(([part, operation]) => [operation, part]),
);

function listed(name: EndpointName): Record<string, unknown> {
  const endpoint = API_ENDPOINTS[name];
  return {
    name,
    call: DEDICATED.has(name) ? 'its own tool' : 'operation_call',
    method: endpoint.method,
    area: mcpOperationArea(endpoint),
    summary: endpoint.summary,
    human_only: MCP_HUMAN_ONLY_OPERATIONS[name] ?? null,
  };
}

export function availableOperation(asked: string): EndpointName {
  const name = operationNamed(asked);
  const reason = MCP_UNAVAILABLE_OPERATIONS[name];
  if (reason !== undefined) {
    throw new ToolError(`${name} is unavailable to AI: ${reason}`, 'unsupported_operation');
  }
  return name;
}

export function operationDetails(
  asked: string,
  inScope: OperationScope,
  responses: boolean,
): Record<string, unknown> {
  const name = availableOperation(asked);
  const shape = operationShape(name);
  if (!inScope(endpointAccessArea(shape.endpoint))) {
    throw new ToolError(
      `${name} is in the ${mcpOperationArea(shape.endpoint)} area, which this caller cannot reach`,
      'forbidden',
    );
  }
  return {
    ...listed(name),
    annotations: operationAnnotations(name),
    inputSchema: jsonSchemaOf(shape.input, 'input'),
    ...(responses ? { response: jsonSchemaOf(shape.endpoint.response, 'output') } : {}),
  };
}

export function operationsOfArea(
  area: McpToolArea,
  inScope: OperationScope,
): readonly Record<string, unknown>[] {
  return Object.keys(MCP_HUMAN_ONLY_OPERATIONS)
    .filter(isEndpointName)
    .filter((name) => MCP_UNAVAILABLE_OPERATIONS[name] === undefined)
    .concat(CALLABLE_OPERATIONS)
    .filter((name) => mcpOperationArea(API_ENDPOINTS[name]) === area)
    .filter((name) => inScope(endpointAccessArea(API_ENDPOINTS[name])))
    .map(listed);
}

export function operationLookup(inScope: (area: McpToolArea) => boolean): OperationLookup {
  const accessible: OperationScope = (area) => area === null || inScope(area);
  return {
    details: (name, responses) => operationDetails(name, accessible, responses),
    ofArea: (area) => operationsOfArea(area, accessible),
    inScope,
  };
}
