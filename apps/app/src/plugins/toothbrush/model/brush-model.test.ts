import { readFileSync } from 'node:fs';
import { BRUSH_INTENSITIES, ORALB_MODES, SONICARE_MODES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  INTENSITY_BARS,
  INTENSITY_RAMP,
  clockText,
  hourText,
  linkLine,
  secondsText,
  signalWord,
  stepBar,
  subtitleOf,
  summaryOf,
  syncedChip,
} from './brush-model';
import { MODE_COLOUR } from '../../sonicare/model/mode-colour';
import { frameOf, oralbViewOf, viewOf } from './fixtures';
import { ORALB_MODE_COLOUR } from './oralb-mode-colour';

const NOW = Date.parse('2026-10-18T07:30:00.000Z');

describe('time text', () => {
  it('writes a clock for the brushing timer', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(125)).toBe('2:05');
    expect(clockText(-4)).toBe('0:00');
  });

  it('writes seconds below a minute and a clock above', () => {
    expect(secondsText(45)).toBe('45 s');
    expect(secondsText(60)).toBe('1:00');
  });

  it('pads the hour of a goal window', () => {
    expect(hourText(4)).toBe('04:00');
    expect(hourText(17)).toBe('17:00');
  });
});

describe('the link line', () => {
  it('says live while the brush is linked and mentions earlier sessions being fetched', () => {
    expect(linkLine(viewOf(), NOW)).toBe('Linked now');
    expect(linkLine(viewOf({ link: { fetching: 2 } }), NOW)).toBe(
      'Linked now, fetching earlier sessions',
    );
  });

  it('tells the person what to do when another app has the brush or pairing is lost', () => {
    expect(linkLine(viewOf({ link: { phase: 'busy' } }), NOW)).toContain('Philips Sonicare app');
    expect(linkLine(viewOf({ link: { phase: 'needs_pairing' } }), NOW)).toContain(
      'Bluetooth settings',
    );
    expect(linkLine(viewOf({ link: { phase: 'bluetooth_off' } }), NOW)).toContain(
      'Bluetooth is off',
    );
  });

  it('says when the sleeping brush was last heard, or that it was never heard', () => {
    expect(linkLine(viewOf({ link: { phase: 'asleep' } }), NOW)).toBe('Last heard 1 min ago');
    expect(linkLine(viewOf({ link: { phase: 'asleep', lastHeardAt: null } }), NOW)).toContain(
      'Not heard yet',
    );
  });
});

describe('the sync chip', () => {
  it('shows Live while linked and the age of the last contact otherwise', () => {
    expect(syncedChip(viewOf(), NOW)).toBe('Live');
    expect(syncedChip(viewOf({ link: { phase: 'asleep' } }), NOW)).toBe('Synced 1 min ago');
    expect(syncedChip(viewOf({ link: { lastHeardAt: null } }), NOW)).toBeNull();
  });
});

describe('the one line subtitle', () => {
  it('shows the running clock while brushing', () => {
    const view = viewOf({ frame: { activity: 'brushing', session: 'running', elapsedS: 65 } });
    expect(subtitleOf(view)).toBe('Brushing 1:05');
  });

  it('shows the goal progress of the person at rest and only the state for someone else', () => {
    expect(subtitleOf(viewOf())).toBe('1 of 2 today');
    expect(subtitleOf(viewOf({ view: { mine: false } }))).toBe('Awake');
  });
});

describe('the step bar', () => {
  it('marks done, current and to do steps along the routine', () => {
    const steps = stepBar('clean', 6, 120, 45);
    expect(steps.map((step) => step.state)).toEqual([
      'done',
      'done',
      'current',
      'todo',
      'todo',
      'todo',
    ]);
  });

  it('finishes every step when the routine is over', () => {
    expect(stepBar('clean', 6, 120, 120).every((step) => step.state === 'done')).toBe(true);
  });

  it('gives a mode without zones one whole-mouth step', () => {
    expect(stepBar('tongue_care', 6, 120, 30)).toEqual([{ zone: null, state: 'current' }]);
  });

  it('follows the longer sweeps of the modes that repeat zones', () => {
    expect(stepBar('white_plus', 6, 120, 0)).toHaveLength(8);
    expect(stepBar('gum_health', 6, 120, 0)).toHaveLength(10);
  });
});

describe('the summary read to a screen reader', () => {
  it('names the state, mode, battery and brush head wear', () => {
    expect(summaryOf(viewOf().profile, viewOf())).toBe(
      'Awake, Clean, battery 80 percent, brush head 33 percent worn',
    );
  });

  it('leaves out the brush head for a model that does not report one', () => {
    const view = viewOf();
    expect(summaryOf({ ...view.profile, head: 'none' }, view)).not.toContain('brush head');
  });
});

describe('signal words', () => {
  it.each([
    [null, 'Not measured'],
    [-50, 'Strong'],
    [-70, 'Good'],
    [-90, 'Weak'],
  ] as const)('reads %s dBm as %s', (rssi, word) => {
    expect(signalWord(rssi)).toBe(word);
  });
});

describe('colours that tell the modes and the intensity apart', () => {
  type Theme = 'dark' | 'light';
  const css = readFileSync(new URL('../../../../global.css', import.meta.url), 'utf8');

  function token(theme: Theme, name: string): string {
    const start = css.indexOf(`@variant ${theme} {`);
    const next = css.indexOf('@variant', start + 1);
    const match = new RegExp(`--color-${name}: (#[0-9a-f]{6});`, 'i').exec(
      css.slice(start, next === -1 ? undefined : next),
    );
    if (match?.[1] === undefined) {
      throw new Error(`--color-${name} is missing in the ${theme} theme`);
    }
    return match[1];
  }

  function channel(hex: string, from: number): number {
    const value = parseInt(hex.slice(from, from + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }

  function luminance(hex: string): number {
    return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  }

  function contrast(a: string, b: string): number {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
  }

  it('gives every mode its own colour', () => {
    const roles = SONICARE_MODES.map((mode) => MODE_COLOUR[mode]);
    expect(new Set(roles).size).toBe(SONICARE_MODES.length);
  });

  it.each(['dark', 'light'] as const)(
    'keeps every mode colour and the intensity colour at 3:1 on every %s surface',
    (theme) => {
      const roles = [...SONICARE_MODES.map((mode) => MODE_COLOUR[mode]), 'primary'];
      for (const role of roles) {
        for (const surface of ['surface-1', 'surface-2', 'surface-3']) {
          expect(
            contrast(token(theme, role), token(theme, surface)),
            `${role} on ${surface}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    },
  );

  it('gives each of the nine Oral-B modes its own colour', () => {
    const roles = ORALB_MODES.map((mode) => ORALB_MODE_COLOUR[mode]);
    expect(new Set(roles).size).toBe(ORALB_MODES.length);
  });

  it('keeps the intensity hue out of the mode colours', () => {
    for (const theme of ['dark', 'light'] as const) {
      const hues = SONICARE_MODES.map((mode) => token(theme, MODE_COLOUR[mode]));
      expect(hues).not.toContain(token(theme, 'primary'));
    }
  });

  it('raises the bars and the opacity together from low to high', () => {
    const bars = BRUSH_INTENSITIES.map((level) => INTENSITY_BARS[level]);
    const ramp = BRUSH_INTENSITIES.map((level) => INTENSITY_RAMP[level]);
    expect(bars).toEqual([1, 2, 3]);
    expect([...ramp].sort((a, b) => a - b)).toEqual(ramp);
  });
});

describe('a live frame for the fixtures', () => {
  it('is valid', () => {
    expect(frameOf({ activity: 'brushing' }).activity).toBe('brushing');
  });
});

describe('texts that name the brand', () => {
  it('tells an Oral-B owner to close the Oral-B app', () => {
    expect(linkLine(oralbViewOf({ link: { phase: 'busy' } }), NOW)).toContain('Oral-B app');
    expect(linkLine(oralbViewOf({ link: { phase: 'busy' } }), NOW)).not.toContain('Philips');
  });

  it('reads the Oral-B state view the same way as the Sonicare one', () => {
    expect(subtitleOf(oralbViewOf())).toBe('1 of 2 today');
    expect(summaryOf(oralbViewOf().profile, oralbViewOf())).toContain('Daily Clean');
  });
});
