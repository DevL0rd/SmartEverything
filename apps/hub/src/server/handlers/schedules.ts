import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ScheduleAuthor } from '../../schedules/book';
import type { Schedules } from '../../schedules/start';
import type { Store } from '../../store/store';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { DONE_REPLY, bound, type Bound } from '../router';

type ScheduleRoutes = Record<
  | 'listSchedules'
  | 'createSchedule'
  | 'updateSchedule'
  | 'cancelSchedule'
  | 'runSchedule'
  | 'removeSchedule',
  Bound
>;

function authorOf(store: Store, caller: Caller): ScheduleAuthor {
  const client = clientOf(caller);
  return {
    profileId: profileIdOf(store, caller),
    clientId: client.id,
    role: client.role,
    via: caller.kind === 'client' && caller.via === 'assistant' ? 'assistant' : 'app',
  };
}

export function scheduleRoutes(store: Store, schedules: Schedules): ScheduleRoutes {
  const { book, scheduler } = schedules;
  return {
    listSchedules: bound(E.listSchedules, ({ query }) => store.schedules.list(query)),
    createSchedule: bound(E.createSchedule, ({ body, caller }) =>
      book.create(authorOf(store, caller), body),
    ),
    updateSchedule: bound(E.updateSchedule, ({ params, body, caller }) =>
      book.update(authorOf(store, caller), params.scheduleId, body),
    ),
    cancelSchedule: bound(E.cancelSchedule, ({ params, caller }) =>
      scheduler.cancelRun(book.managed(authorOf(store, caller), params.scheduleId)),
    ),
    runSchedule: bound(E.runSchedule, ({ params, body, caller }) => {
      const row = book.managed(authorOf(store, caller), params.scheduleId);
      return body.step === undefined
        ? scheduler.runNow(row)
        : scheduler.runStepAgain(row, body.step);
    }),
    removeSchedule: bound(E.removeSchedule, ({ params, caller }) => {
      book.remove(authorOf(store, caller), params.scheduleId);
      return DONE_REPLY;
    }),
  };
}
