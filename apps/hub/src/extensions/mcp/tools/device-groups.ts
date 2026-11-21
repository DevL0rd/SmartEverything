import type { Spread } from '@smarteverything/domain';
import { z } from 'zod';
import { deviceScopeOfActor } from './person-reach';
import type { TargetSummary } from './device-group-units';
import { READS, defineTool, type Tool } from './registry';

function range(spread: Spread | null): { min: number; max: number; mean: number } | null {
  return spread === null ? null : { min: spread.min, max: spread.max, mean: spread.mean };
}

function summaryRow(summary: TargetSummary): Record<string, unknown> {
  const { state } = summary;
  return {
    key: summary.key,
    name: summary.name,
    kind: summary.kind,
    member_ids: summary.members.map((member) => member.id),
    lost: summary.lost,
    state: {
      power: state.power,
      members: state.members,
      online: state.online,
      on: state.on,
      level: range(state.level),
      white_temperature: range(state.whiteTemperature),
      colours: state.colours.length,
      support: state.support,
    },
  };
}

export const DEVICE_GROUP_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_device_groups',
    input: z.strictObject({}),
    annotations: READS,
    run: async (context) => ({
      structured: {
        device_groups: (
          await context.store.host.read('mcpDeviceGroupSummaries', deviceScopeOfActor(context))
        ).map(summaryRow),
      },
    }),
  }),
];
