import type { NodeKindLookup } from '@smarteverything/domain';
import type { AutomationV3, AutomationV4, GraphPiece } from '@smarteverything/domain';
import { structureAutomation } from '../../data/graph-adapter';
import { lit, uuidOf, wire } from '../templates/build';
import { graphAutomation, graphMaker, type GraphMaker } from '../templates/graph-kit';
import { setDevices, stateSignal } from '../templates/parts';

function device(name: string): string {
  return uuidOf(`preview/device/${name}`);
}

function speak(m: GraphMaker, key: string, target: string, text: string): GraphPiece {
  return m.node(key, 'notify.speak', {
    target: lit({ device: device(target) }),
    text: lit(text),
  });
}

export function airPurifierGraph(): AutomationV4 {
  const m = graphMaker('preview/air-purifier');
  const trigger = stateSignal(m, 'signal1', {
    subject: device('air-monitor'),
    field: 'pm25',
    test: { is: 'gt', to: 20 },
    holdSeconds: 120,
  });
  const target = { device: device('purifier') };
  return graphAutomation({
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

export function airPurifier(kinds: NodeKindLookup): AutomationV3 {
  const found = structureAutomation(airPurifierGraph(), kinds);
  if (found.kind === 'unstructured')
    throw new Error('The air purifier fixture does not structure.');
  return found.value.tree;
}
