import {
  NODE_REGISTRY,
  type AutomationPluginKindRow,
  type NodeKind,
  type PluginKindStatus,
} from '@smarteverything/domain';

export const PING_KIND_ID = 'plugin.demo.ping';

export const ARRIVED_KIND_ID = 'trigger.plugin.demo.arrived';

function deviceSet(): NodeKind {
  const found = NODE_REGISTRY.get('device.set');
  if (found === undefined) throw new Error('device.set is not a core kind');
  return found;
}

export function pingKind(id: string = PING_KIND_ID): NodeKind {
  const { effect, modes, fallible } = deviceSet();
  return {
    id,
    name: 'Ping the demo',
    category: 'plugins',
    icon: 'plug',
    class: 'effect',
    description: 'Pings the demo plugin.',
    inputs: [
      {
        name: 'target',
        type: { t: 'text' },
        required: true,
        description: 'Who to ping.',
      },
    ],
    outputs: [{ name: 'reply', type: { t: 'text' }, description: 'What the demo answered.' }],
    exits: [],
    ...(effect === undefined ? {} : { effect }),
    ...(modes === undefined ? {} : { modes }),
    ...(fallible === undefined ? {} : { fallible }),
    summary: 'Ping {target}',
    keywords: ['ping', 'demo'],
    origin: { kind: 'plugin', id: 'demo', name: 'Demo', icon: 'plug', version: '1.0.0' },
    access: 'member',
    tier: 'v1',
  };
}

export function kindRow(
  status: PluginKindStatus = 'active',
  kind: NodeKind = pingKind(),
): AutomationPluginKindRow {
  return {
    kind_id: kind.id,
    owner: 'plugin:demo',
    version: '1.0.0',
    interface_hash: 'a'.repeat(64),
    declaration: kind,
    status,
    updated: '2026-10-25T10:00:00.000Z',
  };
}

export function arrivedKind(): NodeKind {
  return {
    id: ARRIVED_KIND_ID,
    name: 'Someone arrives at the demo',
    category: 'plugins',
    icon: 'plug',
    class: 'trigger',
    description: 'Starts when someone arrives at the demo.',
    inputs: [
      {
        name: 'where',
        type: { t: 'ref', of: 'target' },
        required: true,
        description: 'Where to watch.',
      },
    ],
    outputs: [{ name: 'who', type: { t: 'text' }, description: 'Who arrived.' }],
    exits: [],
    summary: 'Someone arrives at {where}',
    keywords: ['arrive', 'demo'],
    origin: { kind: 'plugin', id: 'demo', name: 'Demo', icon: 'plug', version: '1.0.0' },
    access: 'member',
    tier: 'v1',
  };
}
