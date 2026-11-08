import type { AutomationV4, GraphNode, PortValue } from '@smarteverything/domain';
import {
  automation,
  gnode,
  idOf,
  ifNode,
  join,
  loop,
  start,
  together,
  tryNode,
  wire,
} from './graph-scene-fixtures';

export interface BabyOptions {
  readonly backWire?: boolean;
}

function lit(value: string | number | boolean | Readonly<Record<string, string>>): PortValue {
  return { lit: value };
}

function set(key: string, to: PortValue, next: string | undefined, label: string): GraphNode {
  return gnode(key, 'device.set', {
    ports: { target: lit({ device: 'dev-1' }), control: lit('brightness'), to },
    ...(next === undefined ? {} : { to: { next } }),
    label,
  });
}

function feed(key: string, next: string | undefined, label: string): GraphNode {
  return gnode(key, 'notify.feed', {
    ports: { message: lit(label) },
    ...(next === undefined ? {} : { to: { next } }),
    label,
  });
}

function decisions(backWire: boolean): readonly GraphNode[] {
  return [
    start('night'),
    gnode('dark', 'logic.daylight', { ports: { is: lit('night') }, label: 'Is it night' }),
    gnode('level', 'var.constant', { ports: { value: lit(30) }, label: 'Level' }),
    gnode('enabled', 'var.constant', { ports: { value: lit(true) }, label: 'Baby mode on' }),
    {
      ...ifNode(
        'night',
        [{ name: 'Night', label: 'Night', to: 'lamp', when: wire('dark', 'result') }],
        'parents',
      ),
      label: 'Is it night?',
    },
    set('lamp', wire('level', 'value'), 'both', 'Set Nursery lamp'),
    feed('parents', backWire ? 'night' : 'both', 'Notify parents'),
  ];
}

function togetherAndAfter(): readonly GraphNode[] {
  return [
    together(
      'both',
      [
        { name: 'lights', to: 'each' },
        { name: 'notify', to: 'tell' },
      ],
      { ports: { join: lit('all') }, label: 'Do together' },
    ),
    loop('each', 'flow.for_each', { body: 'light', next: 'meet' }, { label: 'For each light' }),
    gnode('light', 'device.set', {
      ports: { target: wire('each', 'item'), control: lit('power'), to: lit(true) },
      label: 'Set Light',
    }),
    feed('tell', 'meet', 'Notify'),
    join('meet', 'guarded'),
    tryNode('guarded', {
      attempt: 'lullaby',
      catches: [{ name: 'any', to: 'sorry' }],
      next: 'wait',
    }),
    gnode('lullaby', 'notify.speak', {
      ports: { target: lit({ device: 'dev-4' }), text: lit('Lullaby') },
      label: 'Play lullaby',
    }),
    feed('sorry', undefined, 'Tell me it failed'),
    gnode('wait', 'flow.wait', { ports: { duration: lit(5000) }, to: { next: 'off' } }),
    set('off', lit(10), undefined, 'Dim Nursery lamp'),
  ];
}

export function babyProgram(options: BabyOptions = {}): AutomationV4 {
  const cry = {
    id: idOf('cry'),
    key: 'cry',
    kind: 'trigger.camera',
    ports: { detection: lit('baby_cry') },
  };
  return automation([...decisions(options.backWire === true), ...togetherAndAfter()], {
    triggers: [cry],
    admit: wire('enabled', 'value'),
  });
}
