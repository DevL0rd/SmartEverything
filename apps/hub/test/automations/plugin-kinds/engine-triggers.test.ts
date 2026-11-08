import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLUGIN_MANIFEST, type SignalInput } from '@smarteverything/domain';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import { contributionsOf } from '../../../src/plugins/contributions';
import {
  closeSetups,
  lit,
  node,
  program,
  rigV3,
  trigger,
} from '../../automations-v3/support/rig-v3';
import type { RigV3 } from '../../automations-v3/support/rig-v3';

afterEach(closeSetups);

const KIND = 'trigger.plugin.chat_hub.message';

const MANIFEST = PLUGIN_MANIFEST.parse({
  id: 'chat-hub',
  name: 'Chat hub',
  version: '1.0.0',
  description: 'A chat service.',
  publisher: 'Tests',
  contributes: {
    events: [{ kind: 'message', title: 'Message', fields: { channel_id: 'string' } }],
  },
});

function catalogWithChatHub(): ReturnType<typeof createKindCatalog> {
  const catalog = createKindCatalog();
  const synced = syncContribution(catalog, pluginContribution(MANIFEST));
  expect(synced.rejections).toEqual([]);
  return catalog;
}

function pluginSignal(rig: RigV3, channel: string): SignalInput {
  const seen: SignalInput[] = [];
  const { sinks } = contributionsOf(
    {
      store: rig.home.db.store,
      signals: {
        emit: (signal) => {
          seen.push(signal);
        },
        register: vi.fn(),
      },
      inbound: vi.fn(),
      now: () => new Date(rig.clock.now()),
    },
    MANIFEST,
    vi.fn(),
  );
  sinks.event({ kind: 'message', subject: null, data: { channel_id: channel } });
  const [signal] = seen;
  if (signal === undefined) throw new Error('the plugin emitted no signal');
  return signal;
}

function watching(rig: RigV3): string {
  return rig.add(
    program(
      [
        node('dim', 'device.set', {
          target: lit({ device: rig.home.lampId }),
          control: lit('brightness'),
          to: lit(40),
        }),
      ],
      { triggers: [trigger(KIND, { channel_id: lit('general') })] },
    ),
  ).id;
}

describe('a stored plugin trigger on the engine', () => {
  it('arms through the catalog matcher and starts a run on a plugin event', async () => {
    const rig = await rigV3({ kinds: catalogWithChatHub() });
    const id = watching(rig);
    rig.engine.sync();
    rig.engine.observe(pluginSignal(rig, 'random'));
    await rig.settle();
    expect(rig.runs(id)).toHaveLength(0);
    rig.engine.observe(pluginSignal(rig, 'general'));
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(id).map((run) => run.status)).toStrictEqual(['succeeded']);
    expect(rig.home.adapter.executed.map((command) => command.value)).toStrictEqual([40]);
  });

  it('does not arm the trigger without the plugin in the catalog', async () => {
    const rig = await rigV3();
    const id = watching(rig);
    rig.engine.sync();
    rig.engine.observe(pluginSignal(rig, 'general'));
    await rig.settle();
    expect(rig.runs(id)).toHaveLength(0);
    expect(rig.finished).toHaveLength(0);
  });
});
