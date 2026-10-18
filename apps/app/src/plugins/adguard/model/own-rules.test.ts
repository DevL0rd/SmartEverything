import { describe, expect, it } from 'vitest';
import { ruleLines } from './own-rules';

describe('ruleLines', () => {
  it('reads block and allow rules in plain words and finds the domain to remove', () => {
    expect(ruleLines(['||doubleclick.net^', '@@||api.smarteverything.home^'])).toEqual([
      { text: '||doubleclick.net^', effect: 'Blocks', domain: 'doubleclick.net' },
      {
        text: '@@||api.smarteverything.home^',
        effect: 'Always allows',
        domain: 'api.smarteverything.home',
      },
    ]);
  });

  it('keeps pattern and other rules read-only', () => {
    const lines = ruleLines(['/^ads?\\d+\\./', '||tracker.example^$important', '||*.cdn.example^']);
    expect(lines.map((line) => line.domain)).toEqual([null, null, null]);
    expect(lines[0]?.effect).toBe('Blocks, pattern');
    expect(lines[1]?.effect).toBe('Blocks');
  });

  it('trims lines and leaves out blanks and comments', () => {
    expect(ruleLines(['  ||a.example^ ', '', '! my note', '# another note', '##.banner'])).toEqual([
      { text: '||a.example^', effect: 'Blocks', domain: 'a.example' },
      { text: '##.banner', effect: 'Blocks', domain: null },
    ]);
  });
});
