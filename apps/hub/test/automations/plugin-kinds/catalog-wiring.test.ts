import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  NODE_REGISTRY,
  type AutomationV3,
  type AutomationV4,
  type NodeKind,
} from '@smarteverything/domain';
import {
  createKindCatalog,
  syncContribution,
  type KindCatalog,
} from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import { automationPrograms } from '../../../src/automations/service-programs';
import { automationHits } from '../../../src/extensions/mcp/tools/search';
import {
  automationOf,
  programRig,
  step,
  trigger as programTrigger,
} from '../../automations-v3/support/program-rig';
import {
  closeSetups,
  lit,
  node,
  program,
  rigV3,
  trigger,
} from '../../automations-v3/support/rig-v3';
import { saveAutomation, trigger as savedTrigger } from '../../support/automation-fixture';
import { captureLogs } from '../../support/logs';
import { testStore } from '../../support/store';
import { POSTED_TRIGGER, POST_NODE, manifestWith } from './fixtures';

const POSTED = 'trigger.plugin.chat_hub.message_posted';
const OWNER_ONLY = 'trigger.plugin.vault.opened';

function chatHub(): KindCatalog {
  const catalog = createKindCatalog();
  syncContribution(
    catalog,
    pluginContribution(
      manifestWith('chat-hub', { nodes: [POST_NODE], triggers: [POSTED_TRIGGER] }),
    ),
  );
  return catalog;
}

function ownerOnlyTrigger(): NodeKind {
  const signal = NODE_REGISTRY.get('trigger.signal');
  if (signal === undefined) throw new Error('trigger.signal is a core kind');
  return { ...signal, id: OWNER_ONLY, name: 'The vault opened', access: 'owner' };
}

afterEach(closeSetups);

describe('the engine reads kinds from the catalog it was given', () => {
  const press = (rig: Awaited<ReturnType<typeof rigV3>>): void => {
    rig.engine.observe({
      source: 'plugin_chat_hub',
      kind: 'message',
      subject: null,
      field: null,
      value: null,
      previous: null,
      at: rig.clock.now().toISOString(),
      profileId: null,
      data: { channel_id: 'c-9', author: 'Ann' },
    });
  };

  const watching = (): AutomationV3 =>
    program([node('note', 'debug.log', { message: lit('posted') })], {
      triggers: [trigger(POSTED, { channel: lit('c-9') })],
    });

  it('starts a run from a plugin trigger when the catalog knows the plugin', async () => {
    captureLogs();
    const rig = await rigV3({ kinds: chatHub() });
    const row = rig.add(watching());
    expect(rig.engine.sync()).toMatchObject({ loaded: 1, refused: 0 });
    press(rig);
    await rig.until(() => rig.runs(row.id).length === 1);
    expect(rig.runs(row.id)).toHaveLength(1);
  });

  it('starts nothing from a plugin trigger the catalog does not know', async () => {
    captureLogs();
    const rig = await rigV3();
    const row = rig.add(watching());
    rig.engine.sync();
    press(rig);
    await rig.settle();
    expect(rig.runs(row.id)).toHaveLength(0);
  });
});

describe('saving an automation checks plugin triggers against the catalog', () => {
  let rig: ReturnType<typeof programRig>;

  afterEach(() => {
    rig.close();
  });

  function create(definition: AutomationV4, kinds: KindCatalog, member: boolean): boolean {
    rig = programRig();
    const service = automationPrograms({ ...rig.env, kinds });
    const caller = member ? rig.member.caller : rig.owner.caller;
    return service.create(caller, { name: 'Vault', enabled: true, definition }).ok;
  }

  function refused(work: () => void): ApiError {
    try {
      work();
    } catch (cause) {
      if (cause instanceof ApiError) return cause;
      throw cause;
    }
    throw new Error('The save was not refused.');
  }

  const vaultProgram = (): AutomationV4 =>
    automationOf([step('log', 'debug.log', { message: { lit: 'opened' } })], {
      triggers: [
        programTrigger('opened', OWNER_ONLY, { source: { lit: 'hub' }, kind: { lit: 'started' } }),
      ],
    });

  function withOwnerOnly(): KindCatalog {
    const catalog = createKindCatalog();
    return {
      ...catalog,
      get: (id) => (id === OWNER_ONLY ? ownerOnlyTrigger() : catalog.get(id)),
      has: (id) => id === OWNER_ONLY || catalog.has(id),
    };
  }

  it('refuses a member an automation started by an owner only plugin trigger', () => {
    const error = refused(() => {
      create(vaultProgram(), withOwnerOnly(), true);
    });
    expect(error.code).toBe('forbidden');
    expect(error.message).toContain('The vault opened');
  });

  it('lets the owner save it', () => {
    expect(create(vaultProgram(), withOwnerOnly(), false)).toBe(true);
  });
});

describe('the assistant search reads kinds from the catalog', () => {
  it('finds an automation by the title of a plugin trigger it uses', async () => {
    captureLogs();
    const opened = await testStore();
    const { store } = opened;
    saveAutomation(store, {
      name: 'Greeter',
      triggers: [savedTrigger(POSTED, { channel: 'c-9' })],
    });
    const named = (kinds: KindCatalog): string[] =>
      automationHits(store, { query: 'A message is posted', limit: 10 }, kinds).map((hit) =>
        String(hit['name']),
      );
    expect(named(chatHub())).toEqual(['Greeter']);
    expect(named(createKindCatalog())).toEqual([]);
    await opened.close();
  });
});
