import {
  CommandRefusedError,
  ORALB_RING_NAMES,
  type BrushStep,
  type DeviceCommand,
  type OralbPrefixRuleName,
  type OralbProbe,
} from '@smarteverything/domain';
import { ORALB_KEY, pacerPayload, ringColourPayload } from '@smarteverything/ble';
import type { CommandContext } from '../toothbrush/brand';
import { QUADRANT_SECONDS } from './capabilities';
import { GateError, assertWritable } from './gate';
import type { OralbState } from './state';
import { configSteps } from './steps';

const PROBE_OF: Readonly<Record<string, OralbProbe>> = {
  brush_pacer: 'pacer_write',
  brush_quadrant_seconds: 'pacer_write',
  brush_ring_colour: 'ring_write',
};

const DEFAULT_SECTORS = 4;

const DEFAULT_SECTOR_SECONDS = 30;

function refuse(capability: string, reason: string): CommandRefusedError {
  return new CommandRefusedError(capability, reason);
}

function pacerSteps(rule: OralbPrefixRuleName, schedule: readonly number[]): BrushStep[] {
  return configSteps(rule, ORALB_KEY.pacer, pacerPayload(schedule));
}

function pacerOn(brush: OralbState, on: boolean, rule: OralbPrefixRuleName): BrushStep[] {
  if (!on) {
    return pacerSteps(rule, []);
  }
  const fallback = Array.from({ length: DEFAULT_SECTORS }, () => DEFAULT_SECTOR_SECONDS);
  return pacerSteps(rule, brush.onPacer ?? fallback);
}

function quadrantSteps(brush: OralbState, seconds: number, rule: OralbPrefixRuleName): BrushStep[] {
  const used = (brush.pacer ?? []).filter((value) => value > 0).length;
  const sectors = used > 0 ? used : DEFAULT_SECTORS;
  return pacerSteps(
    rule,
    Array.from({ length: sectors }, () => seconds),
  );
}

function validQuadrant(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= QUADRANT_SECONDS.min &&
    value <= QUADRANT_SECONDS.max
  );
}

function stepsOf(
  command: DeviceCommand,
  brush: OralbState,
  rule: OralbPrefixRuleName,
): BrushStep[] {
  const { capability, value } = command;
  if (capability === 'brush_pacer' && typeof value === 'boolean') {
    return pacerOn(brush, value, rule);
  }
  if (capability === 'brush_quadrant_seconds' && validQuadrant(value)) {
    return quadrantSteps(brush, value, rule);
  }
  const colour = ORALB_RING_NAMES.find((name) => name === value);
  if (capability === 'brush_ring_colour' && colour !== undefined) {
    return configSteps(rule, ORALB_KEY.ringColour, ringColourPayload(colour));
  }
  throw refuse(capability, 'the toothbrush cannot change this to that value');
}

export function oralbCommand(
  brush: OralbState,
  command: DeviceCommand,
  context: CommandContext,
): BrushStep[] {
  if (!context.owner()) {
    throw refuse(command.capability, 'only the owner changes the settings stored on the brush');
  }
  const probe = PROBE_OF[command.capability];
  if (probe === undefined) {
    throw refuse(command.capability, 'the toothbrush cannot change this');
  }
  try {
    return stepsOf(command, brush, assertWritable(context.state, probe));
  } catch (cause) {
    if (cause instanceof GateError) {
      throw refuse(command.capability, cause.message);
    }
    throw cause;
  }
}
