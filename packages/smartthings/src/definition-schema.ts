import { z } from 'zod';

const JSON_SCHEMA_SHAPE = z.object({
  type: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  maxLength: z.number().int().positive().optional(),
  enum: z.array(z.string()).optional(),
});

const DEFINITION_ATTRIBUTE = z.object({
  schema: z.object({
    properties: z.object({ value: JSON_SCHEMA_SHAPE }),
  }),
  setter: z.string().optional(),
});

const DEFINITION_ARGUMENT = z.object({
  name: z.string().min(1),
  optional: z.boolean().optional(),
  schema: JSON_SCHEMA_SHAPE,
});

const DEFINITION_COMMAND = z.object({
  name: z.string().min(1),
  arguments: z.array(DEFINITION_ARGUMENT).optional(),
});

export const CAPABILITY_DEFINITION = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().optional(),
  attributes: z.record(z.string(), DEFINITION_ATTRIBUTE).optional(),
  commands: z.record(z.string(), DEFINITION_COMMAND).optional(),
});

export type CapabilityDefinition = z.infer<typeof CAPABILITY_DEFINITION>;

export type JsonSchemaShape = z.infer<typeof JSON_SCHEMA_SHAPE>;

export type DefinitionArgument = z.infer<typeof DEFINITION_ARGUMENT>;

export function definitionPath(id: string, version: number): string {
  return `/v1/capabilities/${encodeURIComponent(id)}/${String(version)}`;
}

export function definitionKey(id: string, version: number): string {
  return `${id}@${String(version)}`;
}
