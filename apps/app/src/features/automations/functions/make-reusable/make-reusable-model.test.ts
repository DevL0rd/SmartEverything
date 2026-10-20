import type { AutomationV3 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PREVIEW_LINT } from '../../model/fixtures/lint-context';
import { automation, repeat, step, trigger } from '../../model/editor/editor-fixtures';
import {
  EMPTY_DRAFT,
  editPort,
  extractBody,
  initialDraft,
  toggleExpose,
  nameIssue,
  setName,
  type ExtractTarget,
} from './dialog-model';
import { interfaceRows, summaryLine } from './interface-rows';
import { plainChain, plainReference, typeText, type TitleOf } from './plain-reference';
import { refusalView } from './refusal-view';
import { previewExtract, type PreviewState } from './use-extract-preview';
import { collapseMotion } from './collapse-motion';

const TITLES: Readonly<Record<string, string>> = {
  read: 'Light level',
  first: 'Set lights',
  second: 'Dim lights',
  note: 'Note',
  again: 'Repeat',
  counter: 'Count',
};

const titleOf: TitleOf = (key) => TITLES[key] ?? key;

const TARGET: ExtractTarget = { automationId: '11111111-1111-4111-8111-aaaaaaaaaaaa', revision: 4 };

function lightProgram(): AutomationV3 {
  return automation([
    step('read', { device: { lit: 'd1' }, control: { lit: 'brightness' } }, { kind: 'device.get' }),
    step('first', { to: { wire: { from: 'read', port: 'value' } } }),
    step('second', { to: { wire: { from: 'read', port: 'value' } } }),
    step('note', { message: { wire: { from: 'second', port: 'value' } } }, { kind: 'notify.feed' }),
  ]);
}

function idsOf(program: AutomationV3, keys: readonly string[]): string[] {
  return program.body.nodes.filter((node) => keys.includes(node.key)).map((node) => node.id);
}

type Ready = Extract<PreviewState, { readonly status: 'ready' }>;
type Refused = Extract<PreviewState, { readonly status: 'refused' }>;

function ready(program: AutomationV3, keys: readonly string[]): Ready {
  const state = previewExtract(program, idsOf(program, keys), PREVIEW_LINT);
  if (state.status !== 'ready') throw new Error(`expected a preview, got ${state.status}`);
  return state;
}

function refused(program: AutomationV3, ids: readonly string[]): Refused {
  const state = previewExtract(program, ids, PREVIEW_LINT);
  if (state.status !== 'refused') throw new Error(`expected a refusal, got ${state.status}`);
  return state;
}

describe('interface rows', () => {
  it('explains every inferred input and output in plain references', () => {
    const state = ready(lightProgram(), ['second']);
    const rows = interfaceRows(state.preview, titleOf);
    expect(rows.inputs).toHaveLength(1);
    expect(rows.inputs[0]?.was).toBe('Was Light level › value');
    expect(rows.inputs[0]?.reason).toBe('Read by Dim lights › to');
    expect(rows.outputs).toHaveLength(1);
    expect(rows.outputs[0]?.usedBy).toBe('Used by Note › message');
    expect(rows.exits).toEqual(['done']);
  });

  it('summarises the interface for the live preview card', () => {
    const rows = interfaceRows(ready(lightProgram(), ['second']).preview, titleOf);
    const [input] = rows.inputs;
    const [output] = rows.outputs;
    expect(summaryLine(rows)).toBe(`in: ${input?.name ?? ''} · out: ${output?.name ?? ''}`);
  });

  it('lists the fixed picks that stay inside', () => {
    const program = automation([
      step(
        'read',
        { device: { lit: 'd1' }, control: { lit: 'brightness' } },
        { kind: 'device.get' },
      ),
      step('first', { to: { wire: { from: 'read', port: 'value' } } }),
    ]);
    const { preview } = ready(program, ['read', 'first']);
    expect(preview.fixed.map((item) => `${item.key}.${item.port}`)).toContain('read.device');
    expect(preview.callee.flavour).toBe('action');
  });
});

describe('plain references', () => {
  it('names nodes by title and roots in words', () => {
    expect(plainChain('read', 'value', titleOf)).toBe('Light level › value');
    expect(plainChain('vars', 'step', titleOf)).toBe('Variable › step');
    expect(plainChain('trigger', 'value', titleOf)).toBe('Trigger › value');
  });

  it('describes wires and fixed values', () => {
    expect(plainReference({ wire: { from: 'read', port: 'value' } }, titleOf)).toBe(
      'Light level › value',
    );
    expect(plainReference({ lit: 3 }, titleOf)).toBe('a fixed value');
  });

  it('writes types in words', () => {
    expect(typeText({ t: 'ref', of: 'device' })).toBe('Device');
    expect(typeText({ t: 'list', of: { t: 'number' } })).toBe('List of number');
    expect(typeText({ t: 'optional', of: { t: 'text' } })).toBe('Text, may be empty');
  });
});

describe('refusals with suggestions', () => {
  it('suggests the smallest range for steps that are not next to each other', () => {
    const program = lightProgram();
    const state = refused(program, idsOf(program, ['first', 'note']));
    const view = refusalView(state.refusal, program, state.keys, titleOf);
    expect(view.message).toBe('The selected steps are not next to each other.');
    expect(view.suggestion?.label).toBe('Select 3 nodes from Set lights to Note');
    expect(view.suggestion?.keys).toContain('second');
  });

  it('offers to leave out a trigger', () => {
    const program = automation([step('first', {}), step('second', {})], [trigger('press')]);
    const ids = [...program.triggers.map((node) => node.id), ...idsOf(program, ['first'])];
    const state = refused(program, ids);
    const view = refusalView(state.refusal, program, state.keys, titleOf);
    expect(state.refusal.code).toBe('trigger');
    expect(view.suggestion).toEqual({ label: 'Leave out the trigger', keys: ['first'] });
  });

  it('names a stateful step and offers to leave it out', () => {
    const program = automation([
      step('first', {}),
      step('counter', {}, { kind: 'timing.cooldown' }),
    ]);
    const state = refused(program, idsOf(program, ['first', 'counter']));
    const view = refusalView(state.refusal, program, state.keys, titleOf);
    expect(state.refusal.code).toBe('stateful');
    expect(view.message).toBe(
      'Count remembers things between runs, so it has to stay in the automation.',
    );
    expect(view.suggestion).toEqual({ label: 'Leave out Count', keys: ['first'] });
  });

  it('offers to include the loop a break leaves', () => {
    const program = automation([
      repeat('again', [step('first', {}), step('stop', {}, { kind: 'flow.break' })]),
    ]);
    const stopId = program.body.nodes[0]?.scopes?.['body']?.nodes[1]?.id ?? '';
    const state = refused(program, [stopId]);
    const view = refusalView(state.refusal, program, state.keys, titleOf);
    expect(state.refusal.code).toBe('control');
    expect(view.suggestion).toEqual({ label: 'Include the loop Repeat', keys: ['stop', 'again'] });
  });

  it('refuses an empty selection without a suggestion', () => {
    const state = refused(lightProgram(), []);
    const view = refusalView(state.refusal, lightProgram(), state.keys, titleOf);
    expect(view.message).toBe('Select the steps you want to turn into a Custom Node.');
    expect(view.suggestion).toBeNull();
  });
});

describe('dialog draft and request', () => {
  it('needs a name', () => {
    expect(nameIssue(EMPTY_DRAFT)).toBe('Give the node a name.');
    expect(nameIssue(setName(EMPTY_DRAFT, '  '))).toBe('Give the node a name.');
    expect(nameIssue(setName(EMPTY_DRAFT, 'Dim'))).toBeNull();
  });

  it('sends the keys, the name and only the port edits that were made', () => {
    const program = lightProgram();
    const state = ready(program, ['second']);
    const [input] = state.preview.callee.inputs;
    let draft = setName(EMPTY_DRAFT, ' Dim lights ');
    draft = editPort(draft, 'inputs', input?.name ?? '', { label: 'Level', description: '' });
    const body = extractBody(draft, state.keys, TARGET, state.preview);
    expect(body).toEqual({
      automationId: TARGET.automationId,
      expectedRevision: 4,
      keys: ['second'],
      name: 'Dim lights',
      inputs: [{ name: input?.name, label: 'Level' }],
    });
  });

  it('pre-ticks room picks and sends the ticked fixed picks as inputs', () => {
    const state = ready(lightProgram(), ['first']);
    const preview = {
      ...state.preview,
      fixed: [
        { key: 'first', port: 'room', of: 'room' },
        { key: 'first', port: 'device', of: 'device' },
      ],
    } as const;
    expect(initialDraft(preview).expose).toEqual(['first.room']);
    const draft = toggleExpose(setName(initialDraft(preview), 'Dim'), 'first.device', true);
    expect(extractBody(draft, state.keys, TARGET, preview)?.expose).toEqual([
      { key: 'first', port: 'room' },
      { key: 'first', port: 'device' },
    ]);
    const cleared = toggleExpose(toggleExpose(draft, 'first.device', false), 'first.room', false);
    expect(extractBody(cleared, state.keys, TARGET, preview)?.expose).toBeUndefined();
  });

  it('refuses to build a request without a name', () => {
    const state = ready(lightProgram(), ['second']);
    expect(extractBody(EMPTY_DRAFT, state.keys, TARGET, state.preview)).toBeNull();
  });
});

describe('collapse motion', () => {
  it('collapses in 400 ms and crossfades in 150 ms under reduced motion', () => {
    expect(collapseMotion({ reduced: false })).toEqual({ kind: 'collapse', duration: 400 });
    expect(collapseMotion({ reduced: true })).toEqual({ kind: 'crossfade', duration: 150 });
  });
});
