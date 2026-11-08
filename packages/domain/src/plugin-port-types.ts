import type { z } from 'zod';
import { FLOW_TYPE, type FlowType } from './automation-v3/types';

export function leavesOf(type: FlowType): readonly FlowType[] {
  if (type.t === 'list' || type.t === 'optional') return leavesOf(type.of);
  if (type.t !== 'record') return [type];
  return [
    type,
    ...Object.values(type.fields ?? {}).flatMap(leavesOf),
    ...(type.values === undefined ? [] : leavesOf(type.values)),
  ];
}

function leafProblem(leaf: FlowType, input: boolean): string | null {
  if (leaf.t === 'param' || leaf.t === 'error')
    return `a plugin port cannot use the ${leaf.t} type`;
  if (input && leaf.t === 'any') return 'a plugin input port needs a real type, not any';
  if (leaf.t === 'ref' && leaf.families !== undefined && leaf.of !== 'device') {
    return 'only device references take families';
  }
  return null;
}

export function pluginPortTypeProblems(type: FlowType, input: boolean): readonly string[] {
  return leavesOf(type).flatMap((leaf) => leafProblem(leaf, input) ?? []);
}

function portType(input: boolean): z.ZodType<FlowType> {
  return FLOW_TYPE.superRefine((type, ctx) => {
    for (const message of pluginPortTypeProblems(type, input))
      ctx.addIssue({ code: 'custom', message });
  });
}

export const PLUGIN_PORT_TYPE = portType(false);
export const PLUGIN_INPUT_TYPE = portType(true);
