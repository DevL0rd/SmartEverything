import { describe, expect, it } from 'vitest';
import { isClipboardRefused } from './clipboard-read';

describe('a browser refusing the clipboard', () => {
  it('recognises the refusal the browser clipboard raises', () => {
    const refused = Object.assign(new Error('User denied permission to access clipboard'), {
      code: 'ERR_NO_PERMISSION',
    });
    expect(isClipboardRefused(refused)).toBe(true);
  });

  it('does not take other failures for a refusal', () => {
    expect(isClipboardRefused(new Error('User denied permission to access clipboard'))).toBe(false);
    expect(isClipboardRefused(Object.assign(new Error('gone'), { code: 'ERR_COPY_FAILURE' }))).toBe(
      false,
    );
    expect(isClipboardRefused('User denied permission')).toBe(false);
    expect(isClipboardRefused(null)).toBe(false);
  });
});
