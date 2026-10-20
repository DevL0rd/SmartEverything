import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_RESPONSE_STYLE,
  DEFAULT_RESPONSE_STYLE,
  RESPONSE_FORMATS,
  RESPONSE_PERSONALITIES,
  RESPONSE_VERBOSITIES,
  personalityGuidance,
  responseStyleGuidance,
} from '../src/assistant-response-style';

function style(
  change: Readonly<Record<string, unknown>>,
): ReturnType<typeof ASSISTANT_RESPONSE_STYLE.parse> {
  return ASSISTANT_RESPONSE_STYLE.parse(change);
}

function guidanceOf(
  rows: readonly { readonly value: string; readonly guidance: string }[],
  value: string,
): string {
  const row = rows.find((candidate) => candidate.value === value);
  if (row === undefined) {
    throw new Error(`no row ${value}`);
  }
  return row.guidance;
}

describe('personalityGuidance', () => {
  it('gives the guidance of the chosen preset', () => {
    const preset = RESPONSE_PERSONALITIES.find(
      (row) => row.value !== 'default' && row.value !== 'custom',
    );
    if (preset === undefined) {
      throw new Error('expected a preset personality');
    }
    expect(personalityGuidance(style({ personality: preset.value }))).toBe(preset.guidance);
  });

  it('uses the trimmed custom text for the custom personality', () => {
    expect(
      personalityGuidance(
        style({ personality: 'custom', custom_personality: '  Dry and short.  ' }),
      ),
    ).toBe('Dry and short.');
  });

  it('falls back to the default tone when the custom text is blank', () => {
    expect(personalityGuidance(style({ personality: 'custom', custom_personality: '   ' }))).toBe(
      guidanceOf(RESPONSE_PERSONALITIES, 'default'),
    );
  });

  it('ignores custom text when another personality is chosen', () => {
    expect(
      personalityGuidance(style({ personality: 'default', custom_personality: 'Ignored.' })),
    ).toBe(guidanceOf(RESPONSE_PERSONALITIES, 'default'));
  });
});

describe('responseStyleGuidance', () => {
  it('says nothing for the default style', () => {
    expect(responseStyleGuidance(DEFAULT_RESPONSE_STYLE)).toBe('');
  });

  it('lists the verbosity and format guidance under a short preface', () => {
    const lines = responseStyleGuidance(style({ verbosity: 'brief', format: 'paragraphs' })).split(
      '\n',
    );
    expect(lines[0]).toMatch(/^Presentation preferences/);
    expect(lines.slice(1)).toStrictEqual([
      guidanceOf(RESPONSE_VERBOSITIES, 'brief'),
      guidanceOf(RESPONSE_FORMATS, 'paragraphs'),
    ]);
  });

  it('lists only the part that has guidance', () => {
    const lines = responseStyleGuidance(style({ format: 'paragraphs' })).split('\n');
    expect(lines.slice(1)).toStrictEqual([guidanceOf(RESPONSE_FORMATS, 'paragraphs')]);
  });
});
