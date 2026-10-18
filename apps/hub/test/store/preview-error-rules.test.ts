import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';

const FINGERPRINT = 'a'.repeat(64);

let rig: Rig;

beforeEach(async () => {
  rig = await harnessRig();
});

afterEach(async () => {
  await rig.close();
});

describe('the preview error rules store', () => {
  it('keeps a rule per chat, scope and fingerprint and removes exactly that rule', () => {
    const { store } = rig.opened;
    const chat = rig.newChat({ kind: 'server' });
    const other = rig.newChat({ kind: 'server' });
    const rule = { scopeKey: 'page:p', fingerprint: FINGERPRINT, reason: 'noisy', sample: 'boom' };
    store.previewErrorRules.put(chat.id, rule);
    store.previewErrorRules.put(chat.id, { ...rule, reason: 'still noisy' });
    expect(store.previewErrorRules.list(chat.id).map((entry) => entry.reason)).toEqual([
      'still noisy',
    ]);
    expect(store.previewErrorRules.ignored(chat.id, 'page:p', FINGERPRINT)).toBe(true);
    expect(store.previewErrorRules.ignored(chat.id, 'page:q', FINGERPRINT)).toBe(false);
    expect(store.previewErrorRules.ignored(other.id, 'page:p', FINGERPRINT)).toBe(false);
    store.previewErrorRules.remove(chat.id, 'page:p', FINGERPRINT);
    expect(store.previewErrorRules.list(chat.id)).toEqual([]);
  });
});
