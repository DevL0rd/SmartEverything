import { describe, expect, it } from 'vitest';
import type { AutomationV3 } from '@smarteverything/domain';
import { HEADER_ANCHOR, headerAnchorKey } from './anchor-model';

function automation(triggers: AutomationV3['triggers']): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers,
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [] },
    policy: { mode: 'single' },
  };
}

describe('header anchor', () => {
  it('anchors header edits on the first trigger', () => {
    const first = {
      id: '00000000-0000-4000-8000-0000000000a1',
      key: 'when',
      kind: 'trigger.time',
      ports: {},
    };
    const second = { ...first, id: '00000000-0000-4000-8000-0000000000a2', key: 'later' };
    expect(headerAnchorKey(automation([first, second]))).toBe('when');
  });

  it('anchors on the header when the automation has no trigger', () => {
    expect(headerAnchorKey(automation([]))).toBe(HEADER_ANCHOR);
  });
});
