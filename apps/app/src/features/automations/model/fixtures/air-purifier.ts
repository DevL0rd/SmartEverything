import type { AutomationV3, FlowNode } from '@smarteverything/domain';
import { automation, lit, maker, uuidOf, wire, type Maker } from '../templates/build';
import { setDevices, stateSignal } from '../templates/parts';

function device(name: string): string {
  return uuidOf(`preview/device/${name}`);
}

function speak(m: Maker, key: string, target: string, text: string): FlowNode {
  return m.node(key, 'notify.speak', {
    target: lit({ device: device(target) }),
    text: lit(text),
  });
}

export function airPurifier(): AutomationV3 {
  const m = maker('preview/air-purifier');
  const trigger = stateSignal(m, 'signal1', {
    subject: device('air-monitor'),
    field: 'pm25',
    test: { is: 'gt', to: 20 },
    holdSeconds: 120,
  });
  const target = { device: device('purifier') };
  return automation({
    description: 'Runs the purifier harder while the air is bad and tells the room.',
    triggers: [trigger],
    body: [
      setDevices(m, 'mode', { target, control: 'purifier_mode', to: 'Favorite' }),
      m.node('bad', 'logic.compare', { a: wire('signal1', 'value'), op: lit('gt'), b: lit(50) }),
      m.when(
        'severity',
        wire('bad', 'result'),
        [setDevices(m, 'boost', { target, control: 'fan_speed', to: 14 })],
        [setDevices(m, 'steady', { target, control: 'fan_speed', to: 8 })],
      ),
      speak(m, 'tell', 'living-speaker', 'The air is poor, the purifier is working harder.'),
    ],
  });
}
