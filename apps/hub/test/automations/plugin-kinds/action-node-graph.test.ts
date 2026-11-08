import { afterEach, describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP, type JsonValue } from '@smarteverything/domain';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import { PLUGIN_NODE_PREFIX } from '../../../src/automations/plugin-kinds/perform';
import { readAutomation } from '../../../src/store/repositories/automation-trees';
import {
  closeSetups,
  lit,
  node,
  program,
  rigV3,
  trigger,
} from '../../automations-v3/support/rig-v3';
import { captureLogs } from '../../support/logs';
import { POST_NODE, manifestWith } from './fixtures';

afterEach(closeSetups);

const REMOTE = 'remote-1';

function catalogWithPoster(): { catalog: ReturnType<typeof createKindCatalog>; kind: string } {
  const catalog = createKindCatalog();
  const synced = syncContribution(
    catalog,
    pluginContribution(manifestWith('chat-hub', { nodes: [POST_NODE] })),
  );
  expect(synced.rejections).toEqual([]);
  const kind = catalog.kinds().find((found) => found.id.endsWith(POST_NODE.id))?.id;
  if (kind === undefined) throw new Error('the plugin action kind is not in the catalog');
  return { catalog, kind };
}

describe('a plugin action node through save, load, lowering and a run', () => {
  it('keeps the node a step everywhere and runs it with the plugin handler', async () => {
    const logs = captureLogs();
    const { catalog, kind } = catalogWithPoster();
    const performed: JsonValue[] = [];
    const rig = await rigV3({
      kinds: catalog,
      extraEffects: {
        [PLUGIN_NODE_PREFIX]: (params, request) => {
          performed.push({ kind: request.kind, channel: params['channel'] ?? null });
          return Promise.resolve({ ok: true, value: { messageId: 'm-1' } });
        },
      },
    });
    const row = rig.add(
      program([node('post', kind, { channel: lit('general'), text: lit('Walk done') })], {
        triggers: [trigger('trigger.button', { device: lit(REMOTE), press: lit('single') })],
      }),
    );
    const stored = rig.programs.byId(row.id);
    const post = stored.definition.nodes.find((found) => found.key === 'post');
    expect(post?.kind).toBe(kind);
    expect(Object.keys(stored.layout.nodes)).toContain(post?.id);
    expect(readAutomation(stored.definition, catalog).ok).toBe(true);
    expect(structuredOf(stored.definition, catalog).kind).toBe('structured');
    const core = structuredOf(stored.definition, STATIC_KIND_LOOKUP);
    expect(core.kind === 'unstructured' ? core.problems.map((found) => found.code) : []).toContain(
      'unknown_target',
    );
    expect(rig.engine.sync()).toMatchObject({ loaded: 1 });
    rig.press(REMOTE, 'single');
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id).map((run) => run.status)).toStrictEqual(['succeeded']);
    expect(performed).toStrictEqual([{ kind, channel: 'general' }]);
    expect(logs.events()).not.toContain('automation.not_loaded');
  });
});
