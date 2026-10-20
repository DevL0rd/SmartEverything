import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ToothbrushFacts, VisualProps } from '../types';

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const View = (props: { style?: unknown; children?: ReactNode }): ReactNode => {
    const styles = Array.isArray(props.style) ? props.style : [props.style];
    const looped = styles.some(
      (style) => typeof style === 'object' && style !== null && 'animationName' in style,
    );
    return createElement('i', { 'data-looped': looped ? 'yes' : 'no' }, props.children);
  };
  return { ...original, default: { View }, View };
});

const { PaletteContext, COLOUR_VARIABLE } = await import('../../../design/colour-roles');
const { LIGHTING, LightingContext } = await import('../parts/material');
const { OralbVisual } = await import('./oralb-visual');
const { ToothbrushVisual } = await import('./toothbrush-visual');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

function facts(patch: Partial<ToothbrushFacts> = {}): ToothbrushFacts {
  return {
    brand: 'oralb',
    activity: 'standby',
    link: 'linked',
    mode: 'daily_clean',
    intensity: null,
    pressure: null,
    head: 'fitted',
    headType: null,
    wear: null,
    battery: 80,
    fault: false,
    ring: '#3870ff',
    face: null,
    sector: null,
    daysLeftRatio: 0.5,
    elapsedS: null,
    display: true,
    handle: null,
    ...patch,
  };
}

function props(patch: Partial<ToothbrushFacts>, extra: Partial<VisualProps> = {}): VisualProps {
  return {
    state: {
      power: 'on',
      online: true,
      level: 0,
      band: null,
      target: null,
      targetShare: null,
      current: null,
      oscillating: false,
      angle: null,
      colour: null,
      ambientLight: null,
      waterLow: false,
      waterLevel: null,
      thermal: 'idle',
      locked: null,
      position: null,
      progress: null,
      battery: null,
      pulse: null,
      syncing: false,
      load: null,
      reading: null,
      source: null,
      presence: null,
      open: null,
      toothbrush: facts(patch),
    },
    size: 'hero',
    px: 220,
    tone: 'active',
    moving: true,
    reduced: false,
    ...extra,
  };
}

function html(visual: VisualProps, light = false): string {
  return renderToStaticMarkup(
    createElement(
      PaletteContext,
      { value: PALETTE },
      createElement(
        LightingContext,
        { value: light ? LIGHTING.light : LIGHTING.dark },
        createElement(OralbVisual, visual),
      ),
    ),
  );
}

function loops(markup: string): number {
  return markup.split('data-looped="yes"').length - 1;
}

const BRUSHING = { activity: 'brushing', pressure: 'optimal', elapsedS: 72, sector: 2 } as const;

describe('the iO handle at rest', () => {
  it('has no running loop in any resting state', () => {
    const resting = [
      { activity: 'asleep' },
      { activity: 'off' },
      { activity: 'standby' },
      { activity: 'standby', face: 7, elapsedS: 125 },
      { link: 'busy' },
      { head: 'missing' },
      { display: false },
      { ring: null },
    ] as const;
    for (const patch of resting) {
      expect(loops(html(props(patch)))).toBe(0);
    }
  });

  it('has no running loop when brushing is off screen, reduced or the brush is offline', () => {
    expect(loops(html(props(BRUSHING, { moving: false })))).toBe(0);
    expect(loops(html(props(BRUSHING, { reduced: true })))).toBe(0);
    expect(loops(html(props(BRUSHING, { tone: 'offline' })))).toBe(0);
  });
});

describe('the iO handle while brushing', () => {
  it('runs only the head oscillation with a good or light pressure', () => {
    expect(loops(html(props(BRUSHING)))).toBe(1);
    expect(loops(html(props({ ...BRUSHING, pressure: 'no_contact' })))).toBe(1);
  });

  it('adds the ring pulse only while pressing too hard', () => {
    expect(loops(html(props({ ...BRUSHING, pressure: 'too_high' })))).toBe(2);
  });

  it('keeps the oscillation of every mode', () => {
    for (const mode of [
      'daily_clean',
      'sensitive',
      'gum_care',
      'whiten',
      'intense',
      'super_sensitive',
      'tongue_clean',
      'smart_adapt',
      'gentle_white',
    ] as const) {
      expect(loops(html(props({ ...BRUSHING, mode })))).toBe(1);
    }
  });

  it('blinks the timer while paused and only the timer', () => {
    expect(loops(html(props({ ...BRUSHING, activity: 'paused' })))).toBe(1);
  });

  it('draws no oscillating tufts without a head', () => {
    expect(loops(html(props({ ...BRUSHING, head: 'missing' })))).toBe(0);
  });
});

describe('the charger', () => {
  it('breathes only while charging on screen with motion allowed', () => {
    const charging = { activity: 'charging', battery: 50 } as const;
    expect(loops(html(props(charging)))).toBe(1);
    expect(loops(html(props(charging, { moving: false })))).toBe(0);
    expect(loops(html(props(charging, { reduced: true })))).toBe(0);
    expect(loops(html(props({ activity: 'standby' })))).toBe(0);
  });
});

describe('the drawing', () => {
  it('carries its accessible name', () => {
    expect(html(props(BRUSHING))).toContain(
      'Oral-B iO, brushing, ring green: good pressure, 1:12, quarter 2 of 4',
    );
  });

  it('draws the glass only on a handle with a display', () => {
    expect(html(props({ display: true }))).not.toBe(html(props({ display: false })));
    expect(html(props({ display: false, activity: 'standby' }))).not.toContain('DC');
  });

  it('draws an outline in the light theme that the dark theme does not need', () => {
    expect(html(props({}), true)).not.toBe(html(props({}), false));
  });

  it('draws a different handle for each handle colour', () => {
    const colours = ['black', 'white', 'rose', 'aqua', 'lavender'] as const;
    const drawn = new Set(colours.map((handle) => html(props({ handle }))));
    expect(drawn.size).toBe(colours.length);
  });
});

describe('the toothbrush visual', () => {
  function pick(brand: ToothbrushFacts['brand']): string {
    return renderToStaticMarkup(
      createElement(
        PaletteContext,
        { value: PALETTE },
        createElement(ToothbrushVisual, props({ brand })),
      ),
    );
  }

  it('draws the iO handle for Oral-B and the Sonicare handle for anything else', () => {
    expect(pick('oralb')).toContain('Oral-B iO');
    expect(pick('sonicare')).not.toContain('Oral-B iO');
  });
});
