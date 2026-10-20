import { describe, expect, it } from 'vitest';
import { AutomationComputersSlot } from '../../../src/automations/automation-computers';
import { AutomationIntegrationSlot } from '../../../src/automations/automation-integration';
import { WebhookReplies } from '../../../src/automations/effects/webhook-replies';
import { integrationEffects } from '../../../src/automations/integration-effects';

describe('AutomationIntegrationSlot', () => {
  it('refuses every port until the services attach', () => {
    const slot = new AutomationIntegrationSlot();
    expect(() => slot.model).toThrow('aren’t running');
    expect(() => slot.replies).toThrow('aren’t running');
  });

  it('serves the attached ports to the integration effects and drops them on stop', () => {
    const slot = new AutomationIntegrationSlot();
    const handlers = integrationEffects(slot);
    expect(Object.keys(handlers).sort()).toEqual([
      'ai.ask',
      'ai.decide',
      'ai.vision',
      'camera.snapshot',
      'computer.power',
      'device.ir_send',
      'health.read',
      'http.respond',
      'phone.action',
      'signal.emit',
    ]);
    const replies = new WebhookReplies();
    slot.attach({
      model: {
        ask: () => Promise.reject(new Error('unused')),
        decide: () => Promise.reject(new Error('unused')),
      },
      pictures: {
        take: () => Promise.reject(new Error('unused')),
        load: () => Promise.reject(new Error('unused')),
      },
      computers: new AutomationComputersSlot(),
      tools: {
        check: () => {
          throw new Error('unused');
        },
        call: () => Promise.reject(new Error('unused')),
      },
      signals: { emit: () => undefined },
      replies,
      clock: { now: () => new Date(0) },
      ownerProfileId: () => 'owner',
    });
    expect(slot.replies).toBe(replies);
    slot.stop();
    expect(() => slot.replies).toThrow('aren’t running');
  });
});
