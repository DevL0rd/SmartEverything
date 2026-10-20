import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOMATION_PROGRAM_ENDPOINTS as P,
  type AutomationProgramReply,
  type AutomationV3,
} from '@smarteverything/domain';

const call = vi.hoisted(() => vi.fn());

vi.mock('./transport', () => ({ api: (): unknown => ({ call }) }));

import { AutomationRefusedError, createAutomation, setAutomationEnabled } from './automations';

const DEFINITION: AutomationV3 = {
  version: 3,
  kind: 'automation',
  triggers: [],
  inputs: [],
  outputs: [],
  variables: [],
  body: { nodes: [] },
  policy: { mode: 'single' },
};

const ACCEPTED: AutomationProgramReply = {
  ok: true,
  summary: 'Saved',
  id: '00000000-0000-4000-8000-000000000001',
  revision: 1,
  problems: [],
};

const REFUSED: AutomationProgramReply = {
  ok: false,
  summary: 'The program has an error',
  id: null,
  revision: null,
  problems: [{ severity: 'error', code: 'port_missing', message: 'A port has no value' }],
};

describe('createAutomation', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('sends the name, switch and program to the program endpoint', async () => {
    call.mockResolvedValue(ACCEPTED);
    const reply = await createAutomation({
      name: 'Evening',
      enabled: true,
      definition: DEFINITION,
    });
    expect(call).toHaveBeenCalledWith(P.createAutomationProgram, {
      body: { name: 'Evening', enabled: true, definition: DEFINITION },
    });
    expect(reply.id).toBe(ACCEPTED.id);
  });

  it('raises the refusal with its problems when the hub rejects the program', async () => {
    call.mockResolvedValue(REFUSED);
    const failure = await createAutomation({
      name: 'Evening',
      enabled: true,
      definition: DEFINITION,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AutomationRefusedError);
    expect(failure instanceof AutomationRefusedError && failure.problems).toEqual(REFUSED.problems);
  });
});

describe('setAutomationEnabled', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('switches the automation through the enabled endpoint', async () => {
    call.mockResolvedValue(ACCEPTED);
    await setAutomationEnabled('a1', false);
    expect(call).toHaveBeenCalledWith(P.setAutomationProgramEnabled, {
      params: { automationId: 'a1' },
      body: { enabled: false },
    });
  });

  it('raises the refusal when the hub will not switch it', async () => {
    call.mockResolvedValue(REFUSED);
    await expect(setAutomationEnabled('a1', true)).rejects.toBeInstanceOf(AutomationRefusedError);
  });
});
