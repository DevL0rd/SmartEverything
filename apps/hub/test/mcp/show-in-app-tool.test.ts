import { describe, expect, it } from 'vitest';
import { partCallOf, toolNamed } from '../../src/extensions/mcp/tools';

const OPEN_FIELDS = {
  target: { kind: 'setting', page: 'app-updates', setting: null },
  focus: 'app-updates.android-installer',
};
const APP_ID = '33333333-3333-4333-8333-333333333333';

describe('the app_show tool', () => {
  it('is exposed as a tool that can change the app', () => {
    const listing = toolNamed('app_show')?.listing;
    expect(listing?.annotations.readOnlyHint).toBe(false);
  });

  it('serves the selector with the required fields for each action', () => {
    const variants = toolNamed('app_show')?.variants;
    const fields = [
      ['open', 'target'],
      ['highlight', 'focus'],
      ['dismiss', 'appId'],
    ] as const;
    for (const [action, field] of fields) {
      expect(variants?.get(action)).toMatchObject({
        selector: { action },
        inputSchema: { additionalProperties: false, required: ['action', field] },
      });
    }
  });

  it('routes each action to the part that runs it', () => {
    expect(partCallOf('app_show', { action: 'open', ...OPEN_FIELDS })).toEqual({
      name: 'show_in_app',
      args: OPEN_FIELDS,
    });
    expect(partCallOf('app_show', { action: 'highlight', focus: OPEN_FIELDS.focus })).toEqual({
      name: 'point_in_app',
      args: { focus: OPEN_FIELDS.focus },
    });
    expect(partCallOf('app_show', { action: 'dismiss', appId: APP_ID })).toEqual({
      name: 'clear_app_pointer',
      args: { appId: APP_ID },
    });
  });
});
