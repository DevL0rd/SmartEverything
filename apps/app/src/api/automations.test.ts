import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS as E, type AutomationV2 } from '@smarteverything/domain';

const call = vi.hoisted(() => vi.fn());

vi.mock('./transport', () => ({ api: (): unknown => ({ call }) }));

import { testAutomation } from './automations';

const DEFINITION: AutomationV2 = {
  when: [],
  steps: [{ do: 'wait', ms: 1000 }],
};

describe('testAutomation', () => {
  beforeEach(() => {
    call.mockReset();
    call.mockResolvedValue({ id: 'run' });
  });

  it('sends the draft with the inputs the person gave', async () => {
    await testAutomation(null, DEFINITION, { level: 4 });
    expect(call).toHaveBeenCalledWith(E.testAutomation, {
      body: { definition: DEFINITION, inputs: { level: 4 } },
    });
  });

  it('names the saved row when there is one', async () => {
    await testAutomation('a1', DEFINITION);
    expect(call).toHaveBeenCalledWith(E.testAutomation, {
      body: { definition: DEFINITION, inputs: {}, automationId: 'a1' },
    });
  });
});
