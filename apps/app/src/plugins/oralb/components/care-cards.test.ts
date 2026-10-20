import { BRUSH_DIAGNOSTICS_VIEW, ORALB_SETTINGS } from '@smarteverything/domain';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const views = vi.hoisted(
  (): { current: Record<string, unknown>; config: unknown; runtime: unknown } => ({
    current: {},
    config: null,
    runtime: undefined,
  }),
);

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const View = (props: { children?: unknown }): unknown => props.children;
  return {
    ...original,
    default: { View, createAnimatedComponent: (component: unknown): unknown => component },
    View,
    cancelAnimation: (): undefined => undefined,
    useAnimatedStyle: (): object => ({}),
    useAnimatedProps: (): object => ({}),
    useSharedValue: (initial: unknown): object => ({
      get: () => initial,
      set: (): undefined => undefined,
    }),
    useReducedMotion: (): boolean => false,
    withTiming: (value: unknown): unknown => value,
  };
});

vi.mock('../../toothbrush/data/brush-data', () => ({
  useBrushView: (_deviceId: string, kind: string): { data: unknown; isError: boolean } => ({
    data: views.current[kind],
    isError: false,
  }),
  useBrushState: (): { data: unknown; isError: boolean } => ({
    data: views.current['state'],
    isError: false,
  }),
}));

vi.mock('../../toothbrush/data/brush-act', () => ({
  useBrushAct: (): { busy: boolean; problem: null; act: () => undefined } => ({
    busy: false,
    problem: null,
    act: (): undefined => undefined,
  }),
}));

vi.mock('../data/use-oralb', () => ({
  useOralbConfig: (): unknown => views.config,
  useOralbSettings: (): unknown => views.config,
}));

vi.mock('../../../store/selectors', () => ({
  useDeviceValue: (): unknown => views.runtime,
}));

vi.mock('../../../store/clock', () => ({
  useMinute: (): number => Date.parse('2026-10-18T07:30:00Z'),
}));

const { PaletteContext, COLOUR_VARIABLE } = await import('../../../design/colour-roles');
const { oralbViewOf } = await import('../../toothbrush/model/fixtures');
const { OralbHeadCard } = await import('./head-card');
const { OralbCareCards } = await import('./care-cards');
const { OralbDiagnostics } = await import('../settings/diagnostics');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });
const NOW = '2026-10-18T07:00:00.000Z';

const HEAD_VIEW = {
  view: 'head',
  head: {
    state: 'fitted',
    type: null,
    usageS: null,
    limitS: null,
    wearPercent: null,
    sessionsLeft: 11,
    replaceBy: '2026-11-10T00:00:00.000Z',
    madeOn: null,
    daysLeft: 23,
    secondsLeft: 1300,
    reminder: 'on',
    baselineDays: 90,
  },
  timeline: [
    {
      serial: 'a',
      type: null,
      firstSeen: '2026-07-01T00:00:00.000Z',
      lastSeen: '2026-08-20T00:00:00.000Z',
      usageS: 50 * 86_400,
      limitS: 90 * 86_400,
      current: false,
    },
    {
      serial: 'b',
      type: null,
      firstSeen: '2026-08-21T00:00:00.000Z',
      lastSeen: '2026-10-17T00:00:00.000Z',
      usageS: 67 * 86_400,
      limitS: 90 * 86_400,
      current: true,
    },
  ],
  perDayS: null,
} as const;

function render<P extends object>(node: ComponentType<P>, props: P): string {
  return renderToStaticMarkup(
    createElement(PaletteContext, { value: PALETTE }, createElement(node, props)),
  );
}

function setup(options: {
  readonly passed?: boolean;
  readonly consent?: boolean;
  readonly mayConfigure?: boolean;
}): ReturnType<typeof oralbViewOf> {
  const view = { ...oralbViewOf(), mayConfigure: options.mayConfigure ?? true };
  views.current = { head: HEAD_VIEW, state: view };
  views.config = {
    oralb: ORALB_SETTINGS.parse({
      probes: options.passed === true ? { head_reset_write: { passedAt: NOW, firmware: 82 } } : {},
    }),
    consent: options.consent ?? false,
  };
  return view;
}

describe('the Oral-B head card', () => {
  it('shows the countdown, the replace date, the reminder and the resets', () => {
    const view = setup({});
    const markup = render(OralbHeadCard, { deviceId: view.deviceId, view });
    expect(markup).toContain('23 days');
    expect(markup).toContain('about 11 sessions left');
    expect(markup).toContain('Reminder on');
    expect(markup).toContain('Replace by');
    expect(markup).toContain('Counted from the last time the reminder was reset on the handle.');
    expect(markup).toContain('2 heads');
  });

  it('keeps both head actions off, with one reason, until the head test passed', () => {
    const view = setup({});
    const markup = render(OralbHeadCard, { deviceId: view.deviceId, view });
    expect(markup).toContain('I replaced the head');
    expect(markup).toContain('Snooze');
    expect(markup).toContain('Changing the brush is off until a safe test');
    expect(markup.split('Changing the brush is off until').length - 1).toBe(1);
  });

  it('turns the actions on after the test and consent, for the owner only', () => {
    const owner = setup({ passed: true, consent: true });
    expect(render(OralbHeadCard, { deviceId: owner.deviceId, view: owner })).not.toContain(
      'Changing the brush is off',
    );
    const member = setup({ passed: true, consent: true, mayConfigure: false });
    expect(render(OralbHeadCard, { deviceId: member.deviceId, view: member })).toContain(
      'Only the owner can change the brush',
    );
  });
});

describe('the Oral-B care cards', () => {
  it('shows the handle with its chips, ring, modes, pacer and the locked counters', () => {
    const view = setup({});
    const markup = render(OralbCareCards, { deviceId: view.deviceId, view });
    expect(markup).toContain('iO Series · firmware 82');
    expect(markup).toContain('iO9');
    expect(markup).toContain('SmartRing: White');
    expect(markup).toContain('Daily Clean');
    expect(markup).toContain('2:00 target');
    expect(markup).toContain('Read after the handle test passes');
  });

  it('adds the sessions on a charge only when the handle reports a runtime', () => {
    const view = setup({});
    views.runtime = undefined;
    expect(render(OralbCareCards, { deviceId: view.deviceId, view })).not.toContain(
      'On this charge',
    );
    views.runtime = { value: 1100 };
    expect(render(OralbCareCards, { deviceId: view.deviceId, view })).toContain(
      'About 9 brushing sessions left on this charge',
    );
    views.runtime = undefined;
  });
});

describe('the Oral-B diagnostics', () => {
  it('lists the nine handle tests with their status and a copy button for the raw records', () => {
    const view = setup({});
    views.current = {
      state: view,
      diagnostics: BRUSH_DIAGNOSTICS_VIEW.parse({
        view: 'diagnostics',
        profile: view.profile,
        link: view.link,
        brand: {
          brand: 'oralb',
          identity: {
            address: 'A0:14:3D:11:22:33',
            advertAddress: 'A0:14:3D:11:22:33',
            protocol: 8,
            modelId: 54,
            firmware: 82,
            gapName: null,
            services: [],
            present: [],
            ff05Length: 8,
            ff05Runtime: null,
            ff0bLength: 10,
            ff2bLength: 4,
            ff2dLength: 5,
            advertHex: '08365208320000050001',
            clock: null,
          },
          probes: { advert_log: { passedAt: NOW, firmware: 82 } },
          forceBands: null,
          headBaseline: null,
          advertIntervalMs: null,
          liveSource: null,
          filterRegistered: true,
          records: [{ at: NOW, hex: '0a0b' }],
        },
        rawLog: { enabled: false, frames: [] },
      }),
    };
    const markup = render(OralbDiagnostics, { deviceId: view.deviceId, mayConfigure: true });
    expect(markup).toContain('Handle tests: 1 of 9 run');
    expect(markup.split('Not run').length - 1).toBe(8);
    expect(markup).toContain('Passed');
    expect(markup).toContain('Run again');
    expect(markup).toContain('Copy the raw records');
    expect(markup).toContain('07:00:00  0a0b');
  });
});
