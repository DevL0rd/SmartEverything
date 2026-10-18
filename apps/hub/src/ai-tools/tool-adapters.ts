import { Behavior, type FunctionDeclaration } from '@google/genai';
import type { ToolSpec } from './hub-tool';
import { geminiSchemaOf } from './gemini-schema';
import { portableSchemaOf } from './portable-schema';

export interface OpenAiTool {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

const EMPTY_OBJECT = { type: 'object', properties: {} } as const;

function parametersOf(spec: ToolSpec): Readonly<Record<string, unknown>> {
  const schema = portableSchemaOf(spec.inputSchema);
  return Object.keys(schema).length === 0 ? EMPTY_OBJECT : { ...EMPTY_OBJECT, ...schema };
}

export function geminiDeclarationOf(spec: ToolSpec): FunctionDeclaration {
  return {
    name: spec.name,
    description: spec.description,
    behavior: Behavior.NON_BLOCKING,
    parametersJsonSchema: geminiSchemaOf(parametersOf(spec)),
  };
}

export function openAiToolOf(spec: ToolSpec): OpenAiTool {
  return {
    type: 'function',
    function: { name: spec.name, description: spec.description, parameters: parametersOf(spec) },
  };
}
