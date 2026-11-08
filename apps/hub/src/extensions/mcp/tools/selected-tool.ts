import { z } from 'zod';
import type { McpToolName } from '@smarteverything/domain';
import type { ActingAs, OperatingContext } from './acting';
import { scopedToolCall } from './authority';
import { servedListing } from './served';
import {
  ToolError,
  argumentIssues,
  jsonSchemaOf,
  validArguments,
  type Tool,
  type ToolAnnotations,
  type ToolImage,
  type ToolOutput,
} from './registry';

type Fields = Readonly<Record<string, unknown>>;

export interface Selection {
  readonly issues: (fields: Fields) => string | null;
  readonly run: (context: OperatingContext, fields: Fields, as: ActingAs) => unknown;
}

export class SelectionImages {
  constructor(
    readonly result: unknown,
    readonly images: readonly ToolImage[],
  ) {}
}

export interface SelectionDefinition<I> {
  readonly input: z.ZodType<I>;
  readonly run: (context: OperatingContext, input: I, as: ActingAs) => unknown;
}

export function selection<I>(definition: SelectionDefinition<I>): Selection {
  return {
    issues: (fields) => argumentIssues(definition.input, fields),
    run: (context, fields, as) =>
      definition.run(context, validArguments(definition.input, fields), as),
  };
}

export interface SelectedToolDefinition {
  readonly name: McpToolName;
  readonly selector: 'view' | 'action';
  readonly input: z.ZodObject;
  readonly annotations: ToolAnnotations;
  readonly selections: Readonly<Record<string, Selection>>;
  readonly action: boolean;
}

interface Chosen {
  readonly selection: Selection;
  readonly value: string;
  readonly fields: Fields;
  readonly as: ActingAs;
}

function chosenOf(definition: SelectedToolDefinition, raw: Fields): Chosen {
  const parsed = validArguments(definition.input, raw);
  const value = z.string().parse(parsed[definition.selector]);
  const selection = definition.selections[value];
  if (selection === undefined) {
    throw new ToolError(`${definition.selector} ${value} does not exist`);
  }
  const { [definition.selector]: _selected, personId, ...fields } = parsed;
  const person = z.uuid().optional().parse(personId);
  return { selection, value, fields, as: person === undefined ? {} : { personId: person } };
}

function problemWith(definition: SelectedToolDefinition, raw: Fields): string | null {
  const flat = argumentIssues(definition.input, raw);
  if (flat !== null) return flat;
  const { selection, fields } = chosenOf(definition, raw);
  return selection.issues(fields);
}

export function selectedTool(definition: SelectedToolDefinition): Tool {
  const { name, annotations } = definition;
  return {
    name,
    input: definition.input,
    listing: servedListing(name, jsonSchemaOf(definition.input, 'input'), annotations),
    check: (_context, raw) => problemWith(definition, raw),
    call: async (context, raw): Promise<ToolOutput> => {
      const chosen = chosenOf(definition, raw);
      return await scopedToolCall(context, name, async (scoped) => {
        const value = await chosen.selection.run(scoped, chosen.fields, chosen.as);
        if (value instanceof SelectionImages) {
          return {
            structured: { result: value.result },
            images: value.images,
            action: definition.action,
          };
        }
        return { structured: { result: value ?? null }, action: definition.action };
      });
    },
  };
}
