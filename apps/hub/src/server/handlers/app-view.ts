import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { showInApp, type AppViewDesk } from '../../app-view/show';
import { clientOf } from '../auth';
import { DONE_REPLY, bound, type Routes } from '../router';

export function appViewRoutes(desk: AppViewDesk): Routes<'answerAppView' | 'showInApp'> {
  return {
    answerAppView: bound(E.answerAppView, ({ body, caller }) => {
      desk.broker.answer(clientOf(caller).id, body.requestId, body.result);
      return DONE_REPLY;
    }),
    showInApp: bound(E.showInApp, ({ body, caller }) => showInApp(desk, caller, body)),
  };
}
