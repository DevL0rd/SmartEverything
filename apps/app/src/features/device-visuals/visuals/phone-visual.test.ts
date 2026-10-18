import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PhoneFacts, VisualProps } from '../types';

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
const { PHONE_UNKNOWN } = await import('../model/facts/phone');
const { PhoneVisual } = await import('./phone-visual');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

function props(facts: Partial<PhoneFacts>, extra: Partial<VisualProps> = {}): VisualProps {
  return {
    state: {
      power: 'unknown',
      online: true,
      level: 0.6,
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
      phone: { ...PHONE_UNKNOWN, ...facts },
    },
    size: 'card',
    px: 96,
    tone: 'active',
    moving: true,
    reduced: false,
    ...extra,
  };
}

function html(visual: VisualProps): string {
  return renderToStaticMarkup(
    createElement(PaletteContext, { value: PALETTE }, createElement(PhoneVisual, visual)),
  );
}

function loops(markup: string): number {
  return markup.split('data-looped="yes"').length - 1;
}

function has(markup: string, id: string): boolean {
  return markup.includes(`id="${id}`);
}

describe('the phone visual draws', () => {
  it('stays still unless the phone is ringing', () => {
    expect(loops(html(props({ level: 62, charging: true })))).toBe(0);
  });

  it('shakes, ripples and pulses while ringing on screen', () => {
    expect(loops(html(props({ ringing: true })))).toBeGreaterThanOrEqual(4);
  });

  it('keeps the ring drawn but still when it is off screen or motion is reduced', () => {
    for (const quiet of [{ moving: false }, { reduced: true }]) {
      const markup = html(props({ ringing: true }, quiet));
      expect(loops(markup)).toBe(0);
      expect(markup.includes('stroke-opacity')).toBe(true);
    }
  });

  it('does not ring, glow or light the torch when the phone is offline', () => {
    const markup = html(props({ ringing: true, charging: true, torch: true }, { tone: 'offline' }));
    expect(loops(markup)).toBe(0);
    expect(has(markup, 'phone-glow')).toBe(false);
    expect(has(markup, 'phone-torch')).toBe(false);
  });

  it('glows for charging, a low battery, heat and ringing, and not otherwise', () => {
    expect(has(html(props({ level: 62 })), 'phone-glow')).toBe(false);
    for (const facts of [{ charging: true }, { level: 10 }, { hot: true }, { ringing: true }]) {
      expect(has(html(props(facts)), 'phone-glow')).toBe(true);
    }
  });

  it('lights a cone from the camera when the torch is on', () => {
    expect(has(html(props({ torch: true })), 'phone-torch')).toBe(true);
    expect(has(html(props({})), 'phone-torch')).toBe(false);
  });

  it('draws two panes with a hinge on an open foldable and one slab otherwise', () => {
    const open = html(props({ fold: 'open' }));
    const closed = html(props({ fold: 'folded' }));
    expect(open).not.toBe(closed);
    expect(html(props({ fold: null }))).toBe(closed);
  });
});
