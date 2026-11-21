import { commandRole } from '../commands';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { pluginOriginOf } from '../../ai-tools/plugin-turn';
import type { ScheduleAuthor } from '../../schedules/book';
import type { Schedules } from '../../schedules/start';
import type { Store } from '../../store/store';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { DONE_REPLY, bound } from '../router';

function authorOf(caller: Caller): ScheduleAuthor {
  if (caller.kind === 'service')
    return {
      profileId: caller.profileId,
      clientId: null,
      role: 'member',
      via: 'assistant',
      plugin: pluginOriginOf(caller),
    };
  const client = clientOf(caller);
  return {
    profileId: profileIdOf(caller),
    clientId: client.id,
    role: commandRole(caller),
    via: caller.kind === 'client' && caller.via === 'assistant' ? 'assistant' : 'app',
    plugin: caller.kind === 'client' ? pluginOriginOf(caller) : null,
  };
}

export const scheduleRoutes = (store: Store, { book, scheduler }: Schedules) =>
  ({
    listSchedules: bound(E.listSchedules, ({ query }) =>
      store.host.call('schedules', 'list', query),
    ),
    createSchedule: bound(E.createSchedule, ({ body, caller }) =>
      book.create(authorOf(caller), body),
    ),
    updateSchedule: bound(E.updateSchedule, ({ params, body, caller }) =>
      book.update(authorOf(caller), params.scheduleId, body),
    ),
    cancelSchedule: bound(E.cancelSchedule, async ({ params, caller }) =>
      scheduler.cancelRun(await book.managed(authorOf(caller), params.scheduleId)),
    ),
    runSchedule: bound(E.runSchedule, async ({ params, body, caller }) => {
      const row = await book.managed(authorOf(caller), params.scheduleId);
      return body.step === undefined
        ? scheduler.runNow(row)
        : scheduler.runStepAgain(row, body.step);
    }),
    removeSchedule: bound(E.removeSchedule, async ({ params, caller }) => {
      await book.remove(authorOf(caller), params.scheduleId);
      return DONE_REPLY;
    }),
  }) as const;
