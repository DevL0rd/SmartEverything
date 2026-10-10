import { describe, expect, it } from 'vitest';
import { createRegistry } from '../src/adapters/registry';
import { createSmartThingsModule } from '../src/adapters/smartthings';
import { SmartThingsWebhooks } from '../src/adapters/smartthings/webhooks';
import type { CameraMotor } from '../src/adapters/xiaomi';

const motor: CameraMotor = { move: () => Promise.resolve() };

describe('createRegistry', () => {
  it('registers every provider, with the SmartThings module it was given', () => {
    const smartthings = createSmartThingsModule({
      app: () => ({ clientId: 'client', clientSecret: 'secret' }),
      webhooks: new SmartThingsWebhooks(),
      io: { fetch, now: () => new Date() },
    });
    const registry = createRegistry(smartthings, motor);
    expect(Object.keys(registry).sort()).toStrictEqual([
      'samsung_tv',
      'smartthings',
      'tuya',
      'xiaomi',
    ]);
    expect(registry.smartthings).toBe(smartthings);
  });
});
