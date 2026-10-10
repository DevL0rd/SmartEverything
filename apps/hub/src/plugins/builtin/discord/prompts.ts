import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DiscordInputError, DiscordPolicyError } from './errors';
import type { EventOrigin } from './origins';
import type { Policy } from './policy';

export const CONTROL_PREFIX = 'se-discord:';

const KEY = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);

const OPTION = z.strictObject({
  key: KEY,
  label: z.string().min(1).max(80),
  style: z.enum(['primary', 'secondary', 'success', 'danger']).optional(),
});

const FIELD = z.strictObject({
  key: KEY,
  label: z.string().min(1).max(45),
  placeholder: z.string().max(100).optional(),
  multiline: z.boolean().default(false),
  required: z.boolean().default(true),
  maxLength: z.number().int().min(1).max(500).default(500),
});

function uniqueKeys(items: readonly { readonly key: string }[]): boolean {
  return new Set(items.map((item) => item.key)).size === items.length;
}

type PromptCandidate = Pick<
  z.output<typeof PROMPT_OBJECT>,
  'mode' | 'options' | 'fields' | 'maxValues'
>;

function promptProblem(input: PromptCandidate): string | null {
  if (!uniqueKeys(input.options) || !uniqueKeys(input.fields)) {
    return 'Keys must be unique';
  }
  if (
    (input.maxValues ?? 1) > 1 &&
    (input.mode !== 'select' || (input.maxValues ?? 1) > input.options.length)
  ) {
    return 'Multiple selections require select mode and enough options';
  }
  return input.mode === 'modal' ? modalProblem(input) : choiceProblem(input);
}

function modalProblem(input: PromptCandidate): string | null {
  return input.fields.length === 0 || input.options.length > 0
    ? 'Modal requires fields only'
    : null;
}

function choiceProblem(input: PromptCandidate): string | null {
  const tooMany = input.mode === 'buttons' && input.options.length > 5;
  return input.options.length === 0 || input.fields.length > 0 || tooMany
    ? 'Buttons/select require valid options only'
    : null;
}

export const PROMPT_OBJECT = z.strictObject({
  content: z.string().min(1).max(2000),
  mode: z.enum(['buttons', 'select', 'modal']),
  options: z.array(OPTION).max(25).default([]),
  maxValues: z.number().int().min(1).max(25).optional(),
  title: z.string().min(1).max(45).default('Input'),
  tone: z.enum(['normal', 'warning']).optional(),
  fields: z.array(FIELD).max(5).default([]),
});

export const PROMPT = PROMPT_OBJECT.superRefine((input, context) => {
  const problem = promptProblem(input);
  if (problem !== null) {
    context.addIssue({ code: 'custom', message: problem });
  }
});

export type Prompt = z.output<typeof PROMPT>;

export interface ControlInput {
  readonly customId: string;
  readonly actorId: string;
  readonly channelId: string;
  readonly guildId: string | null;
  readonly applicationId: string;
  readonly messageId?: string | undefined;
  readonly messageAuthorId?: string | undefined;
  readonly values?: readonly string[] | undefined;
  readonly fields?: Readonly<Record<string, string>> | undefined;
  readonly modal: boolean;
  readonly componentType: number;
}

export interface Accepted {
  readonly eventId: string;
  readonly origin: EventOrigin;
  readonly text?: string;
  readonly modal?: Readonly<Record<string, unknown>>;
}

interface Flow {
  readonly id: string;
  readonly eventId: string;
  readonly prompt: Prompt;
  readonly modalId: string;
  readonly origin: EventOrigin;
  readonly controls: readonly string[];
  readonly messageId?: string;
  readonly state: 'ready' | 'modal' | 'used';
}

const BUTTON_STYLES = { primary: 1, secondary: 2, success: 3, danger: 4 } as const;
const MAX_FLOWS = 100;
const SELECT_TYPE = 3;
const BUTTON_TYPE = 2;

function controlId(): string {
  return `${CONTROL_PREFIX}${randomUUID()}`;
}

export class Flows {
  private readonly items = new Map<string, Flow>();

  constructor(
    private readonly policy: Policy,
    private readonly botId: () => string,
  ) {}

  prepare(
    origin: EventOrigin,
    value: Prompt,
  ): { readonly id: string; readonly components: unknown[] } {
    for (const [id, item] of this.items) {
      if (item.state === 'used') {
        this.items.delete(id);
      }
    }
    if (this.items.size >= MAX_FLOWS) {
      throw new DiscordInputError('Interaction correlation limit reached');
    }
    const prompt = PROMPT.parse(value);
    const flow: Flow = {
      id: randomUUID(),
      origin,
      eventId: origin.id,
      prompt,
      state: 'ready',
      modalId: controlId(),
      controls: prompt.mode === 'buttons' ? prompt.options.map(controlId) : [controlId()],
    };
    this.items.set(flow.id, flow);
    return { id: flow.id, components: this.components(flow) };
  }

  bind(id: string, messageId: string): void {
    const flow = this.items.get(id);
    if (flow === undefined || !/^\d{17,20}$/.test(messageId)) {
      throw new DiscordInputError('Invalid prompt message binding');
    }
    this.items.set(id, { ...flow, messageId });
  }

  accept(input: ControlInput): Accepted {
    this.policy.assertUser(input.actorId);
    const flow = [...this.items.values()].find(
      (item) => item.controls.includes(input.customId) || item.modalId === input.customId,
    );
    if (flow === undefined || flow.state === 'used') {
      throw new DiscordInputError('Control is unknown or consumed');
    }
    this.assertSource(flow, input);
    if (input.modal) {
      return this.submit(flow, input);
    }
    if (
      flow.state !== 'ready' ||
      input.messageId !== flow.messageId ||
      input.messageAuthorId !== this.botId()
    ) {
      throw new DiscordPolicyError('Control prompt binding mismatch');
    }
    if (input.componentType !== (flow.prompt.mode === 'select' ? SELECT_TYPE : BUTTON_TYPE)) {
      throw new DiscordInputError('Unexpected control type');
    }
    return this.choice(flow, input);
  }

  private components(flow: Flow): unknown[] {
    const { prompt, controls } = flow;
    const [only = ''] = controls;
    if (prompt.mode === 'select') {
      return [
        {
          type: 1,
          components: [
            {
              type: SELECT_TYPE,
              custom_id: only,
              min_values: 1,
              max_values: prompt.maxValues ?? 1,
              options: prompt.options.map((item) => ({ label: item.label, value: item.key })),
            },
          ],
        },
      ];
    }
    const options =
      prompt.mode === 'modal'
        ? [{ key: 'input', label: 'Open input', style: undefined }]
        : prompt.options;
    return [
      {
        type: 1,
        components: options.map((item, index) => ({
          type: BUTTON_TYPE,
          style: BUTTON_STYLES[item.style ?? 'primary'],
          label: item.label,
          custom_id: controls[index] ?? only,
        })),
      },
    ];
  }

  private assertSource(flow: Flow, input: ControlInput): void {
    const { origin } = flow;
    this.policy.assertOrigin(origin);
    if (
      input.applicationId !== this.botId() ||
      input.actorId !== origin.actorId ||
      input.channelId !== origin.channelId ||
      input.guildId !== origin.guildId
    ) {
      throw new DiscordPolicyError('Control source or actor mismatch');
    }
  }

  private choice(flow: Flow, input: ControlInput): Accepted {
    const { prompt } = flow;
    if (prompt.mode === 'modal') {
      this.items.set(flow.id, { ...flow, state: 'modal' });
      return { eventId: flow.eventId, origin: flow.origin, modal: this.modal(flow) };
    }
    const values = this.picked(flow, input);
    this.items.set(flow.id, { ...flow, state: 'used' });
    const [first] = values;
    return {
      eventId: flow.eventId,
      origin: flow.origin,
      text: JSON.stringify(values.length === 1 ? { choice: first } : { choices: values }),
    };
  }

  private picked(flow: Flow, input: ControlInput): string[] {
    const { prompt } = flow;
    const chosen =
      prompt.mode === 'buttons'
        ? [prompt.options[flow.controls.indexOf(input.customId)]?.key]
        : input.values;
    const values = (chosen ?? []).filter((value): value is string => value !== undefined);
    const unknown = values.some((value) => !prompt.options.some((item) => item.key === value));
    if (
      values.length === 0 ||
      values.length > (prompt.maxValues ?? 1) ||
      new Set(values).size !== values.length ||
      unknown
    ) {
      throw new DiscordInputError('Invalid control choice');
    }
    return values;
  }

  private modal(flow: Flow): Readonly<Record<string, unknown>> {
    return {
      custom_id: flow.modalId,
      title: flow.prompt.title,
      components: flow.prompt.fields.map((field) => ({
        type: 18,
        label: field.label,
        component: {
          type: 4,
          custom_id: field.key,
          style: field.multiline ? 2 : 1,
          required: field.required,
          max_length: field.maxLength,
          ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
        },
      })),
    };
  }

  private submit(flow: Flow, input: ControlInput): Accepted {
    if (flow.state !== 'modal' || flow.modalId !== input.customId || input.fields === undefined) {
      throw new DiscordInputError('Modal has no matching launch');
    }
    this.assertFields(flow, input.fields);
    this.items.set(flow.id, { ...flow, state: 'used' });
    return {
      eventId: flow.eventId,
      origin: flow.origin,
      text: JSON.stringify({ fields: input.fields }),
    };
  }

  private assertFields(flow: Flow, given: Readonly<Record<string, string>>): void {
    const { fields } = flow.prompt;
    const keys = Object.keys(given);
    if (
      keys.length !== fields.length ||
      keys.some((key) => !fields.some((field) => field.key === key))
    ) {
      throw new DiscordInputError('Unknown modal fields');
    }
    for (const field of fields) {
      const value = given[field.key] ?? '';
      if (value.length > field.maxLength || (field.required && value.length === 0)) {
        throw new DiscordInputError('Invalid modal field length');
      }
    }
  }
}
