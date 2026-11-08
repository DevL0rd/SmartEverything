import { ApiError, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';
import type { Clock } from '../../clock';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { outputs, parsed } from '../engine-v3-effects';
import type { IntegrationPorts } from '../integration-effects';
import { hydrationOf, millilitresOf, todayAt } from '../world-v3/health-reads';
import { PERSON_REF } from '../world-v3/refs';
import type { EffectHandler, EffectHandlers } from './effect-run';
import { awaitRun } from './run-abort';
import { callTool } from './tool';

export interface HealthEffectPorts {
  readonly store: Store;
  readonly clock: Pick<Clock, 'now'>;
  readonly integration: Pick<IntegrationPorts, 'tools' | 'ownerProfileId'>;
}

const WATER_PARAMS = z.object({
  person: PERSON_REF.optional(),
  amount: z.number().positive(),
  unit: z.enum(['millilitres', 'glasses']).default('millilitres'),
});

const LOGGED_WATER = z.object({ entry: z.object({ data: z.object({ liters: z.number() }) }) });

type WaterAsk = z.infer<typeof WATER_PARAMS>;

function profileOf(ports: HealthEffectPorts, person: string | undefined): string {
  const authority = currentExecutionAuthority();
  const own = authority?.profile_id ?? ports.integration.ownerProfileId();
  if (
    person !== undefined &&
    person !== own &&
    authority !== undefined &&
    executionRole(authority) !== 'owner'
  )
    throw new ApiError('forbidden', 'Members can only log water for themselves.');
  return person ?? own;
}

function toolArgs(ask: WaterAsk): Readonly<Record<string, JsonValue>> {
  return {
    ...(ask.unit === 'glasses' ? { glasses: ask.amount } : { millilitres: ask.amount }),
    ...(ask.person === undefined ? {} : { personId: ask.person }),
  };
}

function logWater(ports: HealthEffectPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(WATER_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      const profileId = profileOf(ports, checked.value.person);
      const logged = LOGGED_WATER.parse(
        await awaitRun(
          callTool(
            ports.integration.tools,
            { profileId, tool: 'log_water', args: toolArgs(checked.value) },
            { plugin: null },
          ),
          run,
        ),
      );
      const day = todayAt({ store: ports.store, clock: ports.clock });
      return {
        ok: true,
        value: outputs({
          added: millilitresOf(logged.entry.data.liters),
          total: hydrationOf(ports.store, profileId, day),
        }),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function healthEffects(ports: HealthEffectPorts): EffectHandlers {
  return { 'health.log_water': logWater(ports) };
}
