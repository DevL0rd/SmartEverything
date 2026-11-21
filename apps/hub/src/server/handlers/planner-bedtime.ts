import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { SleepSoundControl } from '../../planner/sleep-sound';
import { DONE_REPLY, bound } from '../router';
import { plannerProfileFor, type PlannerContext } from './planner-profile';

export interface PlannerBedtimeDependencies {
  readonly sleepSound: Pick<SleepSoundControl, 'play' | 'stop'>;
}

export const plannerBedtimeRoutes = (context: PlannerContext, deps: PlannerBedtimeDependencies) =>
  ({
    readPlannerSleep: bound(E.readPlannerSleep, async ({ query, caller }) =>
      context.store.host.read('plannerSleepRead', {
        profileId: await plannerProfileFor(context, caller, query.personId),
        from: query.from,
        to: query.to,
        timeZone: context.store.live.home.settings.read().time_zone,
      }),
    ),
    playPlannerSleepSound: bound(E.playPlannerSleepSound, async ({ query, body, caller }) => {
      const profileId = await plannerProfileFor(context, caller, query.personId);
      const reached =
        body.action === 'play'
          ? await deps.sleepSound.play(profileId, {
              sound: body.sound,
              timerMinutes: body.timer_minutes,
              fadeSeconds: body.fade_seconds,
              clientId: body.clientId,
            })
          : await deps.sleepSound.stop(profileId, body.clientId);
      if (reached === 0) {
        throw new ApiError('command_refused', 'None of the phones of this person is connected.');
      }
      return DONE_REPLY;
    }),
  }) as const;
