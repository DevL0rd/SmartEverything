import { describe, expect, it } from 'vitest';
import { themeIssues, themeStyle } from './theme-vars';

describe('canvas theme variables', () => {
  it('passes --se variables through and drops everything else', () => {
    const theme = { '--se-bg': 'red', '--se-primary': 'blue', color: 'green' };
    expect(themeStyle(theme)).toEqual({ '--se-bg': 'red', '--se-primary': 'blue' });
    expect(themeIssues(theme)).toEqual(['color']);
  });
});
