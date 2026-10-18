import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DiscordInputError, DiscordPolicyError } from '../../../src/plugins/builtin/discord/errors';
import {
  CONTROL_PREFIX,
  Flows,
  PROMPT,
  type ControlInput,
  type Prompt,
} from '../../../src/plugins/builtin/discord/prompts';
import { CHANNEL, GUILD, MESSAGE, OTHER_CHANNEL, OWNER_ID, originOf, worldOf } from './fakes';

const BOT = '600000000000000001';
const BOUND = '700000000000000001';
const BUTTON = 2;
const SELECT = 3;

let flows: Flows;

const ROWS = z.array(
  z.object({
    components: z.array(z.looseObject({ custom_id: z.string(), style: z.number().optional() })),
  }),
);

function controlsOf(components: unknown[]): string[] {
  const rows = ROWS.parse(components);
  return rows.flatMap((row) => row.components.map((component) => component.custom_id));
}

function click(customId: string, overrides: Partial<ControlInput> = {}): ControlInput {
  return {
    customId,
    actorId: OWNER_ID,
    channelId: CHANNEL,
    guildId: GUILD,
    applicationId: BOT,
    messageId: BOUND,
    messageAuthorId: BOT,
    modal: false,
    componentType: BUTTON,
    ...overrides,
  };
}

function buttons(): Prompt {
  return PROMPT.parse({
    content: 'Turn off the lights?',
    mode: 'buttons',
    options: [
      { key: 'yes', label: 'Yes', style: 'success' },
      { key: 'no', label: 'No' },
    ],
  });
}

function prepared(prompt: Prompt, index = 1): { id: string; controls: string[] } {
  const { id, components } = flows.prepare(originOf(index), prompt);
  flows.bind(id, BOUND);
  return { id, controls: controlsOf(components) };
}

beforeEach(() => {
  const world = worldOf();
  flows = new Flows(world.policy, () => BOT);
});

describe('prompt shape', () => {
  it('accepts buttons, a select and a modal that follow the rules', () => {
    expect(() => buttons()).not.toThrow();
    expect(() =>
      PROMPT.parse({
        content: 'Pick',
        mode: 'select',
        options: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ],
        maxValues: 2,
      }),
    ).not.toThrow();
    expect(() =>
      PROMPT.parse({ content: 'Name?', mode: 'modal', fields: [{ key: 'name', label: 'Name' }] }),
    ).not.toThrow();
  });

  it('refuses repeated keys, more than five buttons, and choices mixed with fields', () => {
    const option = (key: string): { key: string; label: string } => ({ key, label: key });
    expect(
      PROMPT.safeParse({ content: 'x', mode: 'buttons', options: [option('a'), option('a')] })
        .success,
    ).toBe(false);
    expect(
      PROMPT.safeParse({
        content: 'x',
        mode: 'buttons',
        options: ['a', 'b', 'c', 'd', 'e', 'f'].map(option),
      }).success,
    ).toBe(false);
    expect(
      PROMPT.safeParse({
        content: 'x',
        mode: 'buttons',
        options: [option('a')],
        fields: [{ key: 'f', label: 'F' }],
      }).success,
    ).toBe(false);
    expect(PROMPT.safeParse({ content: 'x', mode: 'buttons', options: [] }).success).toBe(false);
  });

  it('refuses a modal without fields or with options, and multiple picks outside a select', () => {
    expect(PROMPT.safeParse({ content: 'x', mode: 'modal' }).success).toBe(false);
    expect(
      PROMPT.safeParse({
        content: 'x',
        mode: 'modal',
        options: [{ key: 'a', label: 'A' }],
        fields: [{ key: 'f', label: 'F' }],
      }).success,
    ).toBe(false);
    expect(
      PROMPT.safeParse({
        content: 'x',
        mode: 'buttons',
        options: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ],
        maxValues: 2,
      }).success,
    ).toBe(false);
    expect(
      PROMPT.safeParse({
        content: 'x',
        mode: 'select',
        options: [{ key: 'a', label: 'A' }],
        maxValues: 2,
      }).success,
    ).toBe(false);
  });
});

describe('preparing a prompt', () => {
  it('makes one control per button with unique prefixed ids and the requested styles', () => {
    const { components } = flows.prepare(originOf(1), buttons());
    const ids = controlsOf(components);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id.startsWith(CONTROL_PREFIX))).toBe(true);
    const row = ROWS.parse(components)[0];
    expect(row?.components.map((component) => component.style)).toEqual([3, 1]);
  });

  it('makes one select with the options and the number of picks allowed', () => {
    const { components } = flows.prepare(
      originOf(1),
      PROMPT.parse({
        content: 'Pick',
        mode: 'select',
        options: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ],
        maxValues: 2,
      }),
    );
    const [row] = ROWS.parse(components);
    const [select] = row?.components ?? [];
    expect(select?.custom_id.startsWith(CONTROL_PREFIX)).toBe(true);
    expect(select).toMatchObject({
      type: SELECT,
      min_values: 1,
      max_values: 2,
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
    });
  });

  it('shows a modal prompt as one button that opens the form', () => {
    const { components } = flows.prepare(
      originOf(1),
      PROMPT.parse({ content: 'Name?', mode: 'modal', fields: [{ key: 'name', label: 'Name' }] }),
    );
    expect(ROWS.parse(components)[0]?.components).toHaveLength(1);
  });

  it('refuses a binding to something that is not a message id, or to a prompt that does not exist', () => {
    const { id } = flows.prepare(originOf(1), buttons());
    expect(() => {
      flows.bind(id, 'abc');
    }).toThrow(DiscordInputError);
    expect(() => {
      flows.bind(crypto.randomUUID(), BOUND);
    }).toThrow(DiscordInputError);
  });

  it('holds at most 100 open prompts, and frees the ones already answered', () => {
    const ids: string[][] = [];
    for (let index = 1; index <= 100; index += 1) {
      ids.push(prepared(buttons(), index).controls);
    }
    expect(() => flows.prepare(originOf(101), buttons())).toThrow('correlation limit');
    const first = ids[0]?.[0] ?? '';
    flows.accept(click(first));
    expect(() => flows.prepare(originOf(102), buttons())).not.toThrow();
  });
});

describe('answering a prompt', () => {
  it('turns a button press into the chosen key, once', () => {
    const { controls } = prepared(buttons());
    const accepted = flows.accept(click(controls[1] ?? ''));
    expect(accepted.text).toBe('{"choice":"no"}');
    expect(accepted.eventId).toBe(originOf(1).id);
    expect(accepted.origin.channelId).toBe(CHANNEL);
    expect(() => flows.accept(click(controls[0] ?? ''))).toThrow('unknown or consumed');
  });

  it('turns a select into one choice or a list of choices', () => {
    const prompt = PROMPT.parse({
      content: 'Pick',
      mode: 'select',
      options: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
      ],
      maxValues: 2,
    });
    const single = prepared(prompt, 1);
    expect(
      flows.accept(click(single.controls[0] ?? '', { componentType: SELECT, values: ['b'] })).text,
    ).toBe('{"choice":"b"}');
    const several = prepared(prompt, 2);
    expect(
      flows.accept(click(several.controls[0] ?? '', { componentType: SELECT, values: ['a', 'c'] }))
        .text,
    ).toBe('{"choices":["a","c"]}');
  });

  it('rejects picks that are repeated, too many, empty or not offered', () => {
    const prompt = PROMPT.parse({
      content: 'Pick',
      mode: 'select',
      options: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      maxValues: 2,
    });
    const { controls } = prepared(prompt);
    const control = controls[0] ?? '';
    for (const values of [['a', 'a'], [], ['z'], ['a', 'b', 'a']]) {
      expect(() => flows.accept(click(control, { componentType: SELECT, values }))).toThrow(
        'Invalid control choice',
      );
    }
    expect(flows.accept(click(control, { componentType: SELECT, values: ['a'] })).text).toBe(
      '{"choice":"a"}',
    );
  });

  it('refuses a person the home has not approved', () => {
    const { controls } = prepared(buttons());
    expect(() => flows.accept(click(controls[0] ?? '', { actorId: '100000000000000009' }))).toThrow(
      DiscordPolicyError,
    );
  });

  it('refuses a press from a different person, channel, server or application', () => {
    const { controls } = prepared(buttons());
    const control = controls[0] ?? '';
    for (const change of [
      { actorId: '100000000000000002' },
      { channelId: OTHER_CHANNEL },
      { guildId: '200000000000000009' },
      { applicationId: '600000000000000009' },
    ]) {
      expect(() => flows.accept(click(control, change))).toThrow(DiscordPolicyError);
    }
    expect(flows.accept(click(control)).text).toBe('{"choice":"yes"}');
  });

  it('refuses a press on a message that is not the prompt the bot posted', () => {
    const { controls } = prepared(buttons());
    const control = controls[0] ?? '';
    expect(() => flows.accept(click(control, { messageId: MESSAGE }))).toThrow(
      'prompt binding mismatch',
    );
    expect(() => flows.accept(click(control, { messageAuthorId: OWNER_ID }))).toThrow(
      'prompt binding mismatch',
    );
    expect(() => flows.accept(click(control, { componentType: SELECT }))).toThrow(
      'Unexpected control type',
    );
  });

  it('refuses a control it never made', () => {
    expect(() => flows.accept(click(`${CONTROL_PREFIX}unknown`))).toThrow('unknown or consumed');
  });
});

describe('forms', () => {
  const FORM = PROMPT.parse({
    content: 'Tell me',
    mode: 'modal',
    title: 'Details',
    fields: [
      { key: 'name', label: 'Name', maxLength: 10 },
      { key: 'note', label: 'Note', multiline: true, required: false, placeholder: 'optional' },
    ],
  });

  function opened(): { modalId: string } {
    const { controls } = prepared(FORM);
    const accepted = flows.accept(click(controls[0] ?? ''));
    const modal = accepted.modal;
    if (modal === undefined || typeof modal['custom_id'] !== 'string') {
      throw new Error('the form was not offered');
    }
    return { modalId: modal['custom_id'] };
  }

  function submit(modalId: string, fields: Record<string, string>): ControlInput {
    return click(modalId, {
      modal: true,
      fields,
      messageId: undefined,
      messageAuthorId: undefined,
    });
  }

  it('opens the form with its title and fields, then returns what was filled in', () => {
    const { controls } = prepared(FORM, 2);
    const offered = flows.accept(click(controls[0] ?? '')).modal;
    expect(offered).toMatchObject({ title: 'Details' });
    expect(offered?.['components']).toEqual([
      {
        type: 18,
        label: 'Name',
        component: { type: 4, custom_id: 'name', style: 1, required: true, max_length: 10 },
      },
      {
        type: 18,
        label: 'Note',
        component: {
          type: 4,
          custom_id: 'note',
          style: 2,
          required: false,
          max_length: 500,
          placeholder: 'optional',
        },
      },
    ]);
    const modalId = String(offered?.['custom_id']);
    expect(flows.accept(submit(modalId, { name: 'Ada', note: '' })).text).toBe(
      '{"fields":{"name":"Ada","note":""}}',
    );
    expect(() => flows.accept(submit(modalId, { name: 'Ada', note: '' }))).toThrow(
      'unknown or consumed',
    );
  });

  it('refuses a form that was never opened', () => {
    const { controls } = prepared(FORM);
    expect(() => flows.accept(submit(controls[0] ?? '', { name: 'Ada', note: '' }))).toThrow(
      'Modal has no matching launch',
    );
  });

  it('refuses unknown or missing fields, empty required ones and values over the length', () => {
    const { modalId } = opened();
    expect(() => flows.accept(submit(modalId, { name: 'Ada' }))).toThrow('Unknown modal fields');
    expect(() => flows.accept(submit(modalId, { name: 'Ada', other: 'x' }))).toThrow(
      'Unknown modal fields',
    );
    expect(() => flows.accept(submit(modalId, { name: '', note: '' }))).toThrow(
      'Invalid modal field length',
    );
    expect(() => flows.accept(submit(modalId, { name: 'x'.repeat(11), note: '' }))).toThrow(
      'Invalid modal field length',
    );
    expect(flows.accept(submit(modalId, { name: 'Ada', note: '' })).text).toContain('Ada');
  });
});
