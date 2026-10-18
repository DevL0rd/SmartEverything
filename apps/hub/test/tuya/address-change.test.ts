import { afterEach, describe, expect, it } from 'vitest';
import { FakeTuyaDevice } from './fake-device';
import { waitFor, world, type World } from './world';

let current: World | null = null;
let moved: FakeTuyaDevice | null = null;

afterEach(async () => {
  await moved?.close();
  moved = null;
  await current?.close();
  current = null;
});

describe('a Tuya device that returns on another address', () => {
  it('reconnects to the address in its new broadcast and keeps the same device', async () => {
    const w = await world();
    current = w;
    await w.announce('plug1', '127.0.0.1');
    await waitFor(() => w.plug.connections === 1, 'the first connection');
    await w.plug.close();
    moved = new FakeTuyaDevice('plug1', 'abcdefghijklmnop');
    moved.dps.set(null, { '1': true, '19': 125 });
    await moved.listen('127.0.0.5', w.h.dependencies.localPort);
    await w.announce('plug1', '127.0.0.5');
    await waitFor(() => moved?.connections === 1, 'the connection to the new address');
    await w.sink.until(
      () =>
        w.sink.states.some(
          (state) =>
            state.externalId === 'plug1' && state.capability === 'power' && state.value === true,
        ),
      'the state read from the new address',
    );
    expect(w.sink.latest('plug1')?.details['transport']).toBe('local');
  });
});
