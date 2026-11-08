import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  APP_VIEW_ANSWER,
  APP_VIEW_NOTICE,
  APP_VIEW_REQUEST,
  LIVE_MESSAGE,
  MCP_ROUTES,
  SHOW_IN_APP_INPUT,
  SHOW_IN_APP_RESULT,
  mcpToolOperation,
} from '../src';

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const DEVICE = '11111111-1111-4111-8111-111111111111';

describe('the show in app tool input', () => {
  it('opens a page and may point at one thing on it', () => {
    expect(
      SHOW_IN_APP_INPUT.safeParse({
        action: 'open',
        target: { kind: 'setting', page: 'about/updates', setting: null },
        focus: 'app-updates.channel',
      }).success,
    ).toBe(true);
    expect(
      SHOW_IN_APP_INPUT.safeParse({
        action: 'open',
        target: { kind: 'device', deviceId: DEVICE, focus: null },
      }).success,
    ).toBe(true);
  });

  it('points at one thing without opening anything, and dismisses alone', () => {
    expect(
      SHOW_IN_APP_INPUT.safeParse({ action: 'highlight', focus: 'app-updates.channel' }).success,
    ).toBe(true);
    expect(SHOW_IN_APP_INPUT.safeParse({ action: 'dismiss' }).success).toBe(true);
  });

  it('refuses a missing page to open, a pointer without a focus and a stray field', () => {
    expect(SHOW_IN_APP_INPUT.safeParse({ action: 'open' }).success).toBe(false);
    expect(SHOW_IN_APP_INPUT.safeParse({ action: 'highlight' }).success).toBe(false);
    expect(SHOW_IN_APP_INPUT.safeParse({ action: 'close' }).success).toBe(false);
    expect(
      SHOW_IN_APP_INPUT.safeParse({ action: 'open', target: { kind: 'planet' } }).success,
    ).toBe(false);
    expect(SHOW_IN_APP_INPUT.safeParse({ action: 'dismiss', page: 'home' }).success).toBe(false);
  });
});

describe('the request an app receives and the answer it sends', () => {
  const request = {
    requestId: REQUEST_ID,
    action: 'open',
    target: { kind: 'page', path: 'fitness-sleep' },
    focus: null,
  } as const;

  it('travels as a live notice every app can read', () => {
    expect(APP_VIEW_REQUEST.safeParse(request).success).toBe(true);
    const notice = { type: 'app_view', request };
    expect(APP_VIEW_NOTICE.safeParse(notice).success).toBe(true);
    expect(LIVE_MESSAGE.safeParse(notice).success).toBe(true);
  });

  it('answers done with what was opened, or refused with a reason', () => {
    const done = { ok: true, opened: 'Sleep', highlighted: false, reason: null };
    expect(APP_VIEW_ANSWER.safeParse({ requestId: REQUEST_ID, result: done }).success).toBe(true);
    const missed = { ok: true, opened: null, highlighted: false, reason: 'not_on_screen' };
    expect(APP_VIEW_ANSWER.safeParse({ requestId: REQUEST_ID, result: missed }).success).toBe(true);
    const refused = { ok: false, reason: 'app_not_in_front' };
    expect(APP_VIEW_ANSWER.safeParse({ requestId: REQUEST_ID, result: refused }).success).toBe(
      true,
    );
  });

  it('refuses an answer with a made-up reason', () => {
    const result = { ok: false, reason: 'because' };
    expect(APP_VIEW_ANSWER.safeParse({ requestId: REQUEST_ID, result }).success).toBe(false);
  });

  it('posts the answer to the hub as the person', () => {
    expect(API_ENDPOINTS.answerAppView).toMatchObject({
      method: 'POST',
      path: '/api/app-view/answer',
      access: 'member',
    });
  });
});

describe('the show in app tool', () => {
  it('is the member-level showInApp operation served as one assistant tool', () => {
    expect(API_ENDPOINTS.showInApp).toMatchObject({
      method: 'POST',
      path: '/api/app-view',
      access: 'member',
    });
    expect(mcpToolOperation('show_in_app')).toBe('showInApp');
    expect(MCP_ROUTES.get('app_show')).toEqual({
      key: 'action',
      branches: {
        open: { part: 'show_in_app', line: 'Open a page in the person’s app' },
        highlight: {
          part: 'point_in_app',
          line: 'Point at one thing on the screen it is on now',
        },
        dismiss: {
          part: 'clear_app_pointer',
          line: 'Clear the pointer and close what was opened',
        },
      },
    });
  });

  it('reports what was opened or why nothing was', () => {
    const done = { ok: true, app: 'Pixel', opened: 'Fitness', highlighted: true, reason: null };
    expect(SHOW_IN_APP_RESULT.safeParse(done).success).toBe(true);
    const failed = { ok: false, app: 'Pixel', reason: 'not_connected', detail: 'It is closed.' };
    expect(SHOW_IN_APP_RESULT.safeParse(failed).success).toBe(true);
    expect(SHOW_IN_APP_RESULT.safeParse({ ...failed, reason: 'because' }).success).toBe(false);
    expect(SHOW_IN_APP_RESULT.safeParse({ ...failed, app: undefined }).success).toBe(false);
  });
});
