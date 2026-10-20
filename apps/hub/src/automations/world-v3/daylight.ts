import { weatherConditionHolds } from '@smarteverything/domain';
import { z } from 'zod';
import { parseInputs } from './inputs';
import { outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { homeLocation, homeZone } from './zone';
import type { WorldReadDeps } from './deps';

const MINUTE_MS = 60_000;

const DAYLIGHT = z.object({
  is: z.enum(['day', 'night']),
  sunriseOffset: z.number(),
  sunsetOffset: z.number(),
});

export function daylightHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'logic.daylight': (inputs): ReadResult => {
      const request = parseInputs('logic.daylight', DAYLIGHT, inputs);
      const result = weatherConditionHolds(
        {
          type: 'daylight',
          is: request.is,
          sunriseOffsetMinutes: request.sunriseOffset / MINUTE_MS,
          sunsetOffsetMinutes: request.sunsetOffset / MINUTE_MS,
        },
        {
          now: deps.clock.now(),
          timeZone: homeZone(deps.store),
          forecast: null,
          location: homeLocation(deps.store),
        },
      );
      return outputsOf({ result });
    },
  };
}
