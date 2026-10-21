import { SCENE_ACTIONS } from '@smarteverything/domain';
import { z } from 'zod';
import { CURSOR, moreOf, paged } from '../../../ai-tools/paging';
import { AUTOMATION_FILTER, listAutomations } from './automation-list';
import { DEVICE_CONTROL, applyChanges, changeOf } from './changes';
import { reported, waitFor } from './commanding';
import { COMMANDS, READS, defineTool, matches, type Tool, type ToolContext } from './registry';
import { deviceNames, resolveNamed } from './targets';

export function scenes(context: Pick<ToolContext, 'store'>): Record<string, unknown>[] {
  const names = deviceNames(context.store);
  return context.store.scenes.list().map((scene) => {
    const actions = SCENE_ACTIONS.safeParse(scene.actions);
    return {
      id: scene.id,
      name: scene.name,
      icon: scene.icon,
      actions: actions.success
        ? actions.data.map((action) => ({
            ...action,
            device: names.get(action.deviceId) ?? action.deviceId,
          }))
        : scene.actions,
      problem: actions.success ? null : 'Its actions are not valid commands; edit the scene',
    };
  });
}

const SCENE_FILTER = z.strictObject({
  search: z.string().min(1).max(100).optional().describe('Words in the scene’s name'),
  limit: z.number().int().min(1).max(200).default(100),
  cursor: CURSOR,
});

export const CONTROL_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'device_control',
    input: DEVICE_CONTROL,
    annotations: COMMANDS,
    run: (context, input) => applyChanges(context, [changeOf(input)]),
  }),
  defineTool({
    name: 'scene_run',
    input: z.strictObject({
      sceneId: z
        .string()
        .min(1)
        .max(200)
        .describe('The scene, by name or id (scene_find lists both)'),
    }),
    annotations: COMMANDS,
    run: async (context, input) => {
      const scene = resolveNamed(
        context.store.scenes.list(),
        input.sceneId,
        'scene',
        { names: (row) => [row.name], label: (row) => row.name, id: (row) => row.id },
        'scene_find',
      );
      const outcome = await waitFor(context, 'runScene', { params: { sceneId: scene.id } });
      return {
        structured: { scene: { id: scene.id, name: scene.name }, ...reported(context, outcome) },
      };
    },
  }),
  defineTool({
    name: 'scene_find',
    input: SCENE_FILTER,
    annotations: READS,
    run: (context, input) => {
      const { search } = input;
      const listed = scenes(context).filter(
        (scene) => search === undefined || matches(search, String(scene['name'])),
      );
      const { rows, more } = paged(listed, input.cursor, input.limit);
      return { structured: { scenes: rows, ...moreOf(more) } };
    },
  }),
  defineTool({
    name: 'automation_read',
    input: AUTOMATION_FILTER,
    annotations: READS,
    run: (context, input) => ({ structured: listAutomations(context, input) }),
  }),
];
