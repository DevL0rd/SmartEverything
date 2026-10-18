import { describe, expect, it } from 'vitest';
import { createAutomation, setPower } from './support/programs';
import { useRig } from './support/use-rig';

const rig = useRig();
const CLOUDY = 3;
const RAIN = 63;
const CLEAR = 0;

async function commandsReach(count: number): Promise<void> {
  await rig().until(() => rig().commands().length >= count);
  await rig().settle();
}

describe('C8 weather triggers', () => {
  it('fires when a weather metric enters its comparison and not while it stays inside', async () => {
    await rig().sky.set({ temperature: 20 });
    await createAutomation(rig(), 'Hot', {
      triggers: [
        { type: 'weather', metric: 'temperature', comparison: { operator: 'gt', value: 25 } },
      ],
      actions: [setPower(rig().ids.lamp, true)],
    });
    await rig().sky.set({ temperature: 30 });
    await commandsReach(1);
    await rig().sky.set({ temperature: 31 });
    await rig().settle();
    expect(rig().commands()).toHaveLength(1);
    await rig().sky.set({ temperature: 20 });
    await rig().sky.set({ temperature: 28 });
    await commandsReach(2);
    expect(rig().commands()).toHaveLength(2);
  });

  it('fires on the kind of weather turning to one of the named kinds', async () => {
    await rig().sky.set({ code: CLOUDY });
    await createAutomation(rig(), 'Rain', {
      triggers: [{ type: 'weather_kind', kinds: ['rain', 'storm'] }],
      actions: [setPower(rig().ids.lamp, true)],
    });
    await rig().sky.set({ code: RAIN });
    await commandsReach(1);
    await rig().sky.set({ code: 65 });
    await rig().settle();
    expect(rig().commands()).toHaveLength(1);
    await rig().sky.set({ code: CLEAR });
    await rig().sky.set({ code: RAIN });
    await commandsReach(2);
    expect(rig().commands()).toHaveLength(2);
  });

  it('ignores a weather change that stays outside the comparison', async () => {
    await rig().sky.set({ humidity: 40 });
    await createAutomation(rig(), 'Humid', {
      triggers: [
        { type: 'weather', metric: 'humidity', comparison: { operator: 'gte', value: 80 } },
      ],
      actions: [setPower(rig().ids.lamp, true)],
    });
    await rig().sky.set({ humidity: 60 });
    await rig().sky.set({ humidity: 79 });
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    await rig().sky.set({ humidity: 80 });
    await commandsReach(1);
    expect(rig().commands()).toHaveLength(1);
  });
});
