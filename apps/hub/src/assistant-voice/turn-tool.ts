import type { FunctionDeclaration } from '@google/genai';
import { geminiDeclarationOf } from '../ai-tools/tool-adapters';
import type { TurnTool } from './turn-session';

export function declarationOf(tool: TurnTool): FunctionDeclaration {
  const required = Object.entries(tool.parameters)
    .filter(([, parameter]) => parameter.required)
    .map(([name]) => name);
  return geminiDeclarationOf({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([name, parameter]) => [
          name,
          {
            type: 'string',
            description: parameter.description,
            ...(parameter.choices === undefined ? {} : { enum: [...parameter.choices] }),
          },
        ]),
      ),
      required,
    },
  });
}

export function stringsOf(args: Readonly<Record<string, unknown>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(args).map(([name, value]) => [
      name,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  );
}
