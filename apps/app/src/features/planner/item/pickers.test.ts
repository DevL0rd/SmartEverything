import {
  PLANNER_COMPLETION,
  type DeviceFamily,
  type PlannerAttachment,
  type PlannerCompletion,
  type PlannerSignalCompletion,
} from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PlannerSuggestion } from '../../../api/planner';
import { deviceFixture } from '../../../store/device-fixture';
import type { Upload } from '../../assistant/data/uploads';
import {
  AttachedWidgets,
  attachmentViewOf,
  deviceGroupsOf,
  deviceLineOf,
  faceOf,
  linkAttachmentOf,
  namedGroupsOf,
  pendingOf,
  uploadStateOf,
  withoutAttachment,
  type AttachmentNames,
  type DeviceLine,
  type Picked,
} from './attachment-chips';
import { minuteOptionsOf, ruleChoicesOf } from './completion-rule-picker';
import {
  MANUAL,
  ruleDetailOf,
  ruleTitleOf,
  sameRule,
  withMinutes,
  withWindow,
  type RuleDevice,
} from './completion-rule-row';

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: (props: { readonly children?: ReactNode }): ReactNode =>
    createElement('div', null, props.children ?? null),
}));
vi.mock('../../devices', () => ({
  DeviceFace: (props: { readonly deviceId: string; readonly face: string }): ReactNode =>
    createElement('i', { 'data-device': props.deviceId, 'data-face': props.face }),
}));
vi.mock('../../device-visuals', () => ({
  familyIcon: (family: DeviceFamily): string => `icon-${family}`,
}));
vi.mock('../../models', () => ({
  modelSubjectOf: (): null => null,
  resolvedModelOf: (): null => null,
  useModelCatalog: (): null => null,
  useModelOverrides: (): null => null,
}));

const BRUSH = '00000000-0000-4000-8000-000000000101';
const TREADMILL = '00000000-0000-4000-8000-000000000102';
const BOTTLE = '00000000-0000-4000-8000-000000000103';
const SCENE = '00000000-0000-4000-8000-000000000104';
const AUTOMATION = '00000000-0000-4000-8000-000000000105';

function signal(
  subject: string,
  match: Readonly<Record<string, string>>,
  window: 'occurrence' | 'day',
): PlannerSignalCompletion {
  const parsed = PLANNER_COMPLETION.parse({
    kind: 'signal',
    matcher: { source: 'event', kind: 'activity', subject, match },
    window,
  });
  if (parsed.kind !== 'signal') throw new Error('expected a signal rule');
  return parsed;
}

const BRUSHING = signal(BRUSH, { brushing: 'finished' }, 'occurrence');
const WALKING = signal(TREADMILL, { phase: 'finished', kind: 'walk' }, 'day');
const REFILL = signal(BOTTLE, { activity: 'refill' }, 'day');

const ORAL_B: RuleDevice = { id: BRUSH, label: 'Oral-B iO9', family: 'toothbrush' };
const G15: RuleDevice = { id: TREADMILL, label: 'Kingsmith G15', family: 'treadmill' };

function suggestion(label: string, completion: PlannerCompletion): PlannerSuggestion {
  return {
    label,
    completion,
    matcher: completion.kind === 'signal' ? completion.matcher : null,
  };
}

const BRUSH_TEETH: readonly PlannerSuggestion[] = [
  suggestion('Oral-B iO9 finishes a brushing session', BRUSHING),
];

describe('completion rule picker', () => {
  it('offers the Oral-B iO9 rule first for brush teeth', () => {
    const choices = ruleChoicesOf(MANUAL, BRUSH_TEETH, 'I tick it myself');
    expect(choices.suggested?.title).toBe('Oral-B iO9 finishes a brushing session');
    expect(choices.suggested?.completion).toEqual(BRUSHING);
    expect(choices.suggested?.subtitle).toBe('Counts in this slot or later today');
    expect(choices.others.map((choice) => choice.key)).toEqual(['manual']);
  });

  it('keeps a stored rule the hub no longer suggests, after manual and before other rules', () => {
    const others = [...BRUSH_TEETH, suggestion('kitchen bottle is refilled', REFILL)];
    const choices = ruleChoicesOf(WALKING, others, 'Done when a walk ends');
    expect(choices.others.map((choice) => choice.title)).toEqual([
      'I tick it myself',
      'Done when a walk ends',
      'Kitchen bottle is refilled',
    ]);
    expect(ruleChoicesOf(MANUAL, [], 'x').suggested).toBeNull();
  });

  it('words a walk rule with its length the same way everywhere', () => {
    const rule = withMinutes(WALKING, 20);
    expect(rule.minSeconds).toBe(1200);
    expect(ruleTitleOf(rule, G15)).toBe('Done when a walk of 20 min or more ends');
    expect(ruleDetailOf(withWindow(rule, 'occurrence'), G15, 'You')).toBe(
      'Only your walks on the Kingsmith G15, in this slot or later today',
    );
    expect(ruleDetailOf(rule, G15, 'Anna')).toBe(
      'Only Anna’s walks on the Kingsmith G15, any time that day',
    );
    expect(ruleTitleOf(withMinutes(rule, null), G15)).toBe('Done when a walk ends');
    expect(withMinutes(rule, null)).not.toHaveProperty('minSeconds');
  });

  it('words brushing, bottle and manual rules', () => {
    expect(ruleTitleOf(withMinutes(BRUSHING, 2), ORAL_B)).toBe(
      'Done when brushing of 2 min or more ends',
    );
    const bottle: RuleDevice = { id: BOTTLE, label: 'Kitchen bottle', family: 'bottle' };
    expect(ruleTitleOf(REFILL, bottle)).toBe('Done when Kitchen bottle is refilled');
    expect(ruleDetailOf(REFILL, bottle, 'You')).toBe('Kitchen bottle, any time that day');
    expect(ruleTitleOf(MANUAL, null)).toBe('I tick it myself');
  });

  it('offers the length presets of the device family plus a stored length and Any', () => {
    expect(minuteOptionsOf(G15, WALKING).map((option) => option.label)).toEqual([
      '10 min',
      '20 min',
      'Any',
    ]);
    expect(minuteOptionsOf(G15, withMinutes(WALKING, 45)).map((option) => option.value)).toEqual([
      '10',
      '20',
      '45',
      'any',
    ]);
    expect(minuteOptionsOf(ORAL_B, BRUSHING).map((option) => option.value)).toEqual(['2', 'any']);
    expect(minuteOptionsOf(null, BRUSHING)).toEqual([]);
  });

  it('treats a rule with another window or length as the same rule', () => {
    expect(sameRule(BRUSHING, withWindow(withMinutes(BRUSHING, 2), 'day'))).toBe(true);
    expect(sameRule(BRUSHING, WALKING)).toBe(false);
    expect(sameRule(MANUAL, MANUAL)).toBe(true);
    expect(sameRule(MANUAL, BRUSHING)).toBe(false);
  });
});

const KITCHEN_BOTTLE: DeviceLine = {
  id: BOTTLE,
  label: 'Kitchen bottle',
  subtitle: 'LARQ PureVis 2 · 680 ml',
  icon: 'glassWater',
  family: 'bottle',
};

const NAMES: AttachmentNames = {
  devices: new Map([
    [BOTTLE, KITCHEN_BOTTLE],
    [TREADMILL, { ...KITCHEN_BOTTLE, id: TREADMILL, label: 'Kingsmith G15', subtitle: null }],
  ]),
  scenes: new Map([[SCENE, 'Workout lights']]),
  automations: new Map([[AUTOMATION, 'Fan on during walks']]),
};

const ATTACHED: readonly PlannerAttachment[] = [
  { kind: 'device', deviceId: TREADMILL, face: 'card' },
  { kind: 'scene', sceneId: SCENE },
  { kind: 'automation', automationId: AUTOMATION },
  { kind: 'file', fileId: 'walking-plan' },
  { kind: 'link', url: 'https://www.example.com/queue', title: null },
];

describe('attachment picker', () => {
  it('names a device by its room name with the model as the subtitle', () => {
    const device = deviceFixture(0, { id: BOTTLE, display_name: 'Kitchen bottle' });
    const line = deviceLineOf(device, 'Kitchen', 'LARQ PureVis 2 · 680 ml');
    expect(line.label).toBe('Kitchen bottle');
    expect(line.subtitle).toBe('LARQ PureVis 2 · 680 ml');
    expect(deviceLineOf(device, 'Kitchen', null).subtitle).toBe('Kitchen · plug');
    expect(deviceLineOf(device, null, 'Kitchen bottle').subtitle).toBe('plug');
  });

  it('leaves out the device kind when the name already says it', () => {
    const plug = deviceFixture(0, { id: BOTTLE, display_name: 'Desk plug' });
    expect(deviceLineOf(plug, 'Office', null).subtitle).toBe('Office');
    expect(deviceLineOf(plug, null, null).subtitle).toBeNull();
  });

  it('labels every attachment kind as a chip', () => {
    expect(ATTACHED.map((attachment) => attachmentViewOf(attachment, NAMES).label)).toEqual([
      'Kingsmith G15 · card',
      'Scene · Workout lights',
      'Automation · Fan on during walks',
      'File',
      'Link · example.com',
    ]);
    expect(withoutAttachment(ATTACHED, `scene:${SCENE}`)).toHaveLength(4);
  });

  it('reads the widget face, defaulting to the card', () => {
    expect(faceOf(null)).toBe('card');
    expect(faceOf('row')).toBe('row');
    expect(faceOf('hologram')).toBe('card');
  });

  it('lists devices with the rule device first and hides attached ones', () => {
    const devices = [deviceFixture(0, { id: BOTTLE }), deviceFixture(1, { id: TREADMILL })];
    const free = deviceGroupsOf(devices, NAMES, { taken: new Set(), text: '' }, BOTTLE);
    expect(free.suggested.map((entry) => entry.title)).toEqual(['Kitchen bottle']);
    expect(free.rest.map((entry) => entry.title)).toEqual(['Kingsmith G15']);
    const taken = deviceGroupsOf(
      devices,
      NAMES,
      { taken: new Set([`device:${TREADMILL}`]), text: 'larq' },
      null,
    );
    expect(taken.rest.map((entry) => entry.title)).toEqual(['Kitchen bottle']);
    const scenes = namedGroupsOf([{ id: SCENE, name: 'Workout lights' }], 'scene', {
      taken: new Set(),
      text: 'work',
    });
    expect(scenes.rest.map((entry) => entry.icon)).toEqual(['sparkles']);
  });

  it('builds the attachment the Attach button adds', () => {
    const picked: Picked = { kind: 'device', chosen: BOTTLE, face: 'panel', url: '', title: '' };
    expect(pendingOf(picked, NAMES, [])).toEqual({
      attachments: [{ kind: 'device', deviceId: BOTTLE, face: 'panel' }],
      label: 'Attach Kitchen bottle',
    });
    expect(pendingOf({ ...picked, kind: 'link', url: 'ftp://x' }, NAMES, [])).toBeNull();
    expect(linkAttachmentOf(' https://example.com/a ', ' Queue ')).toEqual({
      kind: 'link',
      url: 'https://example.com/a',
      title: 'Queue',
    });
    const uploading: Upload = {
      key: 'u1',
      draftKey: 'planner:x',
      name: 'Walking plan.pdf',
      mime: 'application/pdf',
      preview: null,
      progress: 0.5,
      state: 'uploading',
      attachment: null,
      failure: null,
    };
    expect(uploadStateOf(uploading)).toBe('50 %');
    expect(pendingOf({ ...picked, kind: 'file' }, NAMES, [uploading])).toBeNull();
  });

  it('renders the device widget for a device attachment with its face', () => {
    const markup = renderToStaticMarkup(
      createElement(AttachedWidgets, {
        attachments: [
          { kind: 'device', deviceId: BOTTLE, face: 'panel' },
          { kind: 'device', deviceId: TREADMILL, face: null },
          { kind: 'scene', sceneId: SCENE },
        ],
      }),
    );
    expect(markup).toContain(`data-device="${BOTTLE}" data-face="panel"`);
    expect(markup).toContain(`data-device="${TREADMILL}" data-face="card"`);
    expect(markup.match(/data-device=/g)).toHaveLength(2);
  });
});
