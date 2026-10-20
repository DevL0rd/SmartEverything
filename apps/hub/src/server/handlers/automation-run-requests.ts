import { ApiError } from '@smarteverything/domain';
import type { AutomationRunStartRequest, JsonValue } from '@smarteverything/domain';
import type { z } from 'zod';
import { OVERRIDES, SCENARIO } from '../../automations/sim/scenario';
import type { ScenarioInput } from '../../automations/sim/scenario';
import type { RehearsalRequest } from './automation-runs';

export function invalid(message: string): ApiError {
  return new ApiError('invalid_request', message);
}

export function scenarioOf(input: Readonly<Record<string, JsonValue>>): ScenarioInput {
  const parsed = SCENARIO.safeParse(input);
  if (!parsed.success) throw invalid(`The scenario is not valid: ${parsed.error.message}`);
  return parsed.data;
}

function overridesOf(input: Readonly<Record<string, JsonValue>>): z.input<typeof OVERRIDES> {
  const parsed = OVERRIDES.safeParse(input);
  if (!parsed.success) throw invalid(`The overrides are not valid: ${parsed.error.message}`);
  return parsed.data;
}

export function rehearsalRequestOf(
  body: AutomationRunStartRequest,
  startedBy: string,
  mode: 'dry' | 'simulate',
): RehearsalRequest {
  const scenario = body.scenario === undefined ? undefined : scenarioOf(body.scenario);
  const overrides = body.overrides === undefined ? undefined : overridesOf(body.overrides);
  if (mode === 'simulate' && scenario === undefined)
    throw invalid('A simulation needs a scenario.');
  if (mode === 'dry' && scenario !== undefined) {
    throw invalid('A dry run reads the live home; give overrides instead of a scenario.');
  }
  if (mode === 'simulate' && overrides !== undefined) {
    throw invalid('A simulation takes its overrides inside the scenario.');
  }
  return {
    automationId: body.automationId,
    mode,
    inputs: body.inputs,
    scenario,
    overrides,
    breakpoints: body.breakpoints,
    trigger: body.trigger,
    startedBy,
  };
}

export function requireLiveOnly(body: AutomationRunStartRequest): void {
  const extras = [
    body.scenario === undefined ? null : 'a scenario',
    body.overrides === undefined ? null : 'overrides',
    body.breakpoints.length === 0 ? null : 'breakpoints',
    body.trigger === undefined ? null : 'a trigger',
  ].filter((extra): extra is string => extra !== null);
  if (extras.length > 0) {
    throw invalid(`A live run takes no ${extras.join(' or ')}; use dry or simulate.`);
  }
}
