import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS, CLIENT_PREFS, CLIPBOARD_NOTICE, LIVE_NOTICE } from '../src';

const CLIENT = '3f0a1d52-6a37-4c0e-9d3c-8a1c5f7e2b10';
const AT = '2026-10-18T10:00:00.000Z';

describe('shared clipboard', () => {
  it('is on for a person who never chose', () => {
    expect(CLIENT_PREFS.shared_clipboard.defaultValue).toEqual({ enabled: true });
    expect(CLIENT_PREFS.shared_clipboard.scope).toBe('profile');
  });

  it('refuses an empty copy', () => {
    expect(API_ENDPOINTS.writeSharedClipboard.body.safeParse({ text: '' }).success).toBe(false);
    expect(API_ENDPOINTS.writeSharedClipboard.body.safeParse({ text: 'a' }).success).toBe(true);
  });

  it('reads nothing as null and a copy with who made it', () => {
    const response = API_ENDPOINTS.readSharedClipboard.response;
    expect(response.parse(null)).toBeNull();
    expect(response.parse({ text: 'hello', from: CLIENT, at: AT })).toEqual({
      text: 'hello',
      from: CLIENT,
      at: AT,
    });
  });

  it('travels to the app as a live notice', () => {
    const notice = { type: 'clipboard', text: 'hello', from: CLIENT, at: AT };
    expect(CLIPBOARD_NOTICE.parse(notice)).toEqual(notice);
    expect(LIVE_NOTICE.parse(notice)).toEqual(notice);
  });
});
