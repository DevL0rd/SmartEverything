import { AUTOMATION_NAME, PROGRAM_V4, type McpPartName } from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import type { Adapter, Args } from './adapters';
import { ToolError, type ToolContext, type ToolOutput } from './registry';

const ID = z.uuid();

function textOf(args: Args, key: string): string {
  return z.string().parse(args[key]);
}

function fieldOf(base: z.ZodObject, key: string): z.core.$ZodType {
  const field: unknown = base.shape[key];
  if (!(field instanceof z.core.$ZodType)) {
    throw new ToolError(`The tool part has no field ${key}`, 'internal');
  }
  return field;
}

function programRevision(context: ToolContext, args: Args): number {
  return context.store.automations.byId(textOf(args, 'automationId')).revision;
}

async function switched(
  context: ToolContext,
  automationId: string,
  enabled: boolean,
): Promise<ToolOutput> {
  const result = await operate(
    context,
    'setAutomationProgramEnabled',
    { params: { automationId }, body: { enabled } },
    {},
  );
  return { structured: { result: result ?? null }, action: true };
}

async function renamed(
  context: ToolContext,
  automationId: string,
  name: string,
): Promise<ToolOutput> {
  const result = await operate(
    context,
    'renameAutomationProgram',
    { params: { automationId }, body: { name } },
    {},
  );
  return { structured: { result: result ?? null }, action: true };
}

const UPDATE: Adapter = {
  input: (base) =>
    base.omit({ definition: true, expectedRevision: true }).extend({
      definition: z.optional(fieldOf(base, 'definition')),
      enabled: z
        .boolean()
        .optional()
        .describe(
          'true switches the automation on, false off; with no definition only the switch changes',
        ),
      name: AUTOMATION_NAME.optional().describe(
        'A new name for the automation; a name another automation uses is refused. With no definition only the name changes',
      ),
    }),
  run: async (context, input, base) => {
    const id = textOf(input, 'automationId');
    const { enabled, name, ...rest } = input;
    const steps: (() => Promise<ToolOutput>)[] = [];
    if (typeof name === 'string') steps.push(() => renamed(context, id, name));
    if (rest['definition'] !== undefined) {
      steps.push(() =>
        base.call(context, { ...rest, expectedRevision: programRevision(context, input) }),
      );
    }
    if (typeof enabled === 'boolean') steps.push(() => switched(context, id, enabled));
    let output: ToolOutput | undefined;
    for (const step of steps) output = await step();
    if (output === undefined) {
      throw new ToolError(
        'Give definition to replace the program, enabled to switch the automation on or off, or name to rename it',
      );
    }
    return output;
  },
};

const AT_STORED_REVISION: Adapter = {
  input: (base) => base.omit({ expectedRevision: true }),
  args: (context, input) => ({ ...input, expectedRevision: programRevision(context, input) }),
};

const STORED_REVISION = z.object({ definition: z.unknown(), layout: z.unknown() });

const RESTORE: Adapter = {
  input: () =>
    z.strictObject({
      automationId: ID,
      revision: z
        .int()
        .min(1)
        .describe('The earlier revision to publish again, from automation_read view revisions'),
    }),
  run: async (context, input, base) => {
    const automationId = textOf(input, 'automationId');
    const stored = STORED_REVISION.parse(
      await operate(
        context,
        'getAutomationProgramRevision',
        { params: { automationId, revision: String(z.int().parse(input['revision'])) } },
        {},
      ),
    );
    return base.call(context, {
      automationId,
      definition: stored.definition,
      layout: stored.layout,
      expectedRevision: programRevision(context, input),
    });
  },
};

const CHECK: Adapter = {
  input: () =>
    z
      .strictObject({
        definition: PROGRAM_V4.optional().describe(
          'A whole automation or Custom Node program to check: nodes and wires, one flow.start leading to the first step',
        ),
        automationId: ID.optional().describe('A stored automation to check a patch preview of'),
        ops: z
          .array(z.record(z.string(), z.unknown()))
          .min(1)
          .optional()
          .describe('The patch operations to preview on that automation; nothing is saved'),
      })
      .refine(
        (input) =>
          input.definition === undefined
            ? input.automationId !== undefined && input.ops !== undefined
            : input.automationId === undefined && input.ops === undefined,
        { message: 'give definition, or automationId with ops' },
      ),
  args: (_context, input) => ({
    body:
      input['definition'] === undefined
        ? { automationId: input['automationId'], ops: input['ops'] }
        : { definition: input['definition'] },
  }),
};

const SAVE_NODE: Adapter = {
  input: (base) => base.omit({ expectedRevision: true, confirmBreaking: true }),
  args: (context, input) => ({
    ...input,
    expectedRevision: context.store.automationFunctions.byId(textOf(input, 'functionId'))
      .latest_revision,
    confirmBreaking: true,
  }),
};

const VALUE_OPERATIONS: Readonly<Record<string, readonly string[]>> = {
  boolean: ['set', 'toggle'],
  number: ['set', 'add', 'subtract'],
  duration: ['set', 'add', 'subtract'],
  choice: ['set', 'next', 'previous'],
};

const VALUE_UPDATE: Adapter = { input: (base) => base.omit({ expectedRevision: true }) };

const VALUE_APPLY: Adapter = {
  input: () =>
    z.strictObject({
      valueId: ID,
      operation: z
        .enum(['set', 'toggle', 'add', 'subtract', 'next', 'previous'])
        .describe(
          'on/off: set or toggle; number or duration: set, add or subtract; choice: set, next or previous',
        ),
      value: z
        .union([z.number(), z.boolean(), z.string()])
        .optional()
        .describe('For set: the new value (a choice by its id); for add or subtract: the amount'),
    }),
  args: (context, input) => {
    const valueId = textOf(input, 'valueId');
    const operation = textOf(input, 'operation');
    const { kind } = context.store.automationValues.byId(valueId).content;
    const allowed = VALUE_OPERATIONS[kind] ?? [];
    if (!allowed.includes(operation)) {
      throw new ToolError(`A ${kind} Value takes the operations: ${allowed.join(', ')}`);
    }
    const change =
      input['value'] === undefined
        ? { type: operation }
        : { type: operation, value: input['value'] };
    return { valueId, body: { kind, operation: change } };
  },
};

function withCallingChat(context: ToolContext, raw: Args): Args {
  const chatId = context.actor?.chatId ?? null;
  if (!Array.isArray(raw['steps']) || chatId === null) return raw;
  return {
    ...raw,
    steps: raw['steps'].map((step: unknown) =>
      typeof step === 'object' &&
      step !== null &&
      'kind' in step &&
      step.kind === 'ai' &&
      !('chatId' in step)
        ? { ...step, chatId }
        : step,
    ),
  };
}

const SCHEDULE: Adapter = { input: (base) => base, prepare: withCallingChat };

export const AUTOMATION_ADAPTERS: Readonly<Partial<Record<McpPartName, Adapter>>> = {
  update_automation: UPDATE,
  patch_automation: AT_STORED_REVISION,
  restore_automation_revision: RESTORE,
  publish_automation_draft: AT_STORED_REVISION,
  discard_automation_draft: AT_STORED_REVISION,
  extract_custom_node: AT_STORED_REVISION,
  check_automation: CHECK,
  save_custom_node: SAVE_NODE,
  update_automation_value: VALUE_UPDATE,
  apply_automation_value_operation: VALUE_APPLY,
  schedule_actions: SCHEDULE,
  update_scheduled: SCHEDULE,
};
