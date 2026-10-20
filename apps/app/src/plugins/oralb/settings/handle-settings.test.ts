import { BRUSH_SETTINGS_VIEW, ORALB_SETTINGS } from '@smarteverything/domain';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const config = vi.hoisted((): { current: unknown } => ({ current: null }));

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const View = (props: { children?: unknown }): unknown => props.children;
  return {
    ...original,
    default: { View, createAnimatedComponent: (component: unknown): unknown => component },
    View,
    cancelAnimation: (): undefined => undefined,
    useAnimatedStyle: (): object => ({}),
    useSharedValue: (initial: unknown): object => ({
      get: () => initial,
      set: (): undefined => undefined,
    }),
    useReducedMotion: (): boolean => false,
    withSequence: (value: unknown): unknown => value,
    withSpring: (value: unknown): unknown => value,
    withTiming: (value: unknown): unknown => value,
  };
});

vi.mock('../../../store/control', () => ({
  useControl: (): { value: undefined; set: () => Promise<boolean> } => ({
    value: undefined,
    set: () => Promise.resolve(true),
  }),
}));

vi.mock('../../toothbrush/data/brush-act', () => ({
  useBrushAct: (): { busy: boolean; problem: null; act: () => undefined } => ({
    busy: false,
    problem: null,
    act: (): undefined => undefined,
  }),
  useConfigure: (): (() => undefined) => (): undefined => undefined,
}));

vi.mock('../../toothbrush/settings/anchored', () => ({
  Anchored: (props: { children?: unknown }): unknown => props.children,
}));

vi.mock('../data/use-oralb', () => ({
  useOralbConfig: (): unknown => config.current,
  useOralbSettings: (): unknown => config.current,
}));

const { PaletteContext, COLOUR_VARIABLE } = await import('../../../design/colour-roles');
const { oralbViewOf } = await import('../../toothbrush/model/fixtures');
const { OralbHandleSettings } = await import('./handle-settings');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });
const NOW = '2026-10-18T07:00:00.000Z';

function page(options: {
  readonly probes?: Record<string, unknown>;
  readonly consent?: boolean;
  readonly mayConfigure?: boolean;
}): string {
  const oralb = ORALB_SETTINGS.parse({ probes: options.probes ?? {} });
  config.current = { oralb, consent: options.consent ?? false };
  const state = { ...oralbViewOf(), mayConfigure: options.mayConfigure ?? true };
  const settings = BRUSH_SETTINGS_VIEW.parse({
    view: 'settings',
    settings: null,
    goal: {},
    personId: null,
    profile: state.profile,
    writes: { allowed: false, reason: null },
    mayConfigure: true,
  });
  return renderToStaticMarkup(
    createElement(
      PaletteContext,
      { value: PALETTE },
      createElement(OralbHandleSettings, { deviceId: state.deviceId, state, settings }),
    ),
  );
}

describe('the Oral-B handle settings', () => {
  it('locks every handle control and says why once, before any test passed', () => {
    const markup = page({});
    expect(markup).toContain('Changing the brush is off until a safe test on your brush passes');
    expect(markup).not.toContain('Let SmartEverything change this brush');
    expect(markup.split('Changing the brush is off until').length - 1).toBe(2);
  });

  it('shows the read values as text while locked', () => {
    const markup = page({});
    expect(markup).toContain('On. The handle pulses every quarter.');
    expect(markup).toContain('30 s per quarter, 2:00 target');
    expect(markup).toContain('Daily Clean');
    expect(markup).toContain('White');
    expect(markup).toContain('Not read yet');
  });

  it('offers the consent switch only after a write test passed', () => {
    const passed = { pacer_write: { passedAt: NOW, firmware: 82 } };
    expect(page({ probes: passed })).toContain('Let SmartEverything change this brush');
    expect(page({ probes: passed })).toContain('Turn on the switch above');
    expect(page({ probes: passed, consent: true })).not.toContain('Turn on the switch above');
  });

  it('draws live data choices with their costs, head alerts and the handle colour', () => {
    const markup = page({});
    expect(markup).toContain('Broadcast');
    expect(markup).toContain('Connected');
    expect(markup).toContain('Live cost 2 of 3');
    expect(markup).toContain('Battery cost 3 of 3');
    expect(markup).toContain('Warn before the brush head is due');
    expect(markup).toContain('Days left when the head is due');
    expect(markup).toContain('Handle colour');
  });

  it('leaves the owner settings out for a member', () => {
    expect(page({ mayConfigure: false })).toBe('');
  });
});
