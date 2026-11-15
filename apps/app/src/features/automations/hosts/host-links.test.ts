import { describe, expect, it } from 'vitest';
import { AUTOMATION_RUN_ID } from '@smarteverything/domain';
import { runHref, runPageTitle } from './host-links';

describe('run host links', () => {
  it('titles the run page with the automation name', () => {
    expect(runPageTitle('Night lights')).toBe('Night lights run');
  });

  it('titles the run page plainly while the automation is not loaded', () => {
    expect(runPageTitle(null)).toBe('Run');
  });

  it('links a run through its automation id and run id', () => {
    const id = AUTOMATION_RUN_ID.parse('0b1c7e1e-6f0e-4c0a-9a53-5a3f3a0c2d11');
    expect(runHref({ automation_id: 'a1', id })).toEqual({
      pathname: '/automations/[automationId]/runs/[runId]',
      params: { automationId: 'a1', runId: id },
    });
  });
});
