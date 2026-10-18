import { HARNESS_BUILTIN_IDS } from '@smarteverything/harness';
import { describe, expect, it } from 'vitest';
import { useRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

describe('shared extension settings', () => {
  it('accept any setting name, including ones that merely mention tokens', async () => {
    const [id] = HARNESS_BUILTIN_IDS;
    if (id === undefined) throw new Error('There are no built-in extensions.');
    const before = rig.service.configuration.desired().revision;

    const saved = await rig.service.extensions.change(id, { config: { max_tokens: 4096 } });

    expect(saved.config).toMatchObject({ max_tokens: 4096 });
    expect(rig.service.configuration.desired().revision).not.toBe(before);
    expect(
      rig.service.configuration.desired().entries.find((entry) => entry.id === id)?.config,
    ).toMatchObject({ max_tokens: 4096 });
  });
});
