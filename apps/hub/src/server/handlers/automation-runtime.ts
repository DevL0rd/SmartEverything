import { API_ENDPOINTS as E, ApiError, AutomationValueError } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound, DONE_REPLY } from '../router';

function valueWrite<T>(work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof AutomationValueError) throw new ApiError('invalid_request', cause.message);
    throw cause;
  }
}

export const automationRuntimeRoutes = ({ store, hub }: Pick<ServerContext, 'store' | 'hub'>) =>
  ({
    listAutomationValues: bound(E.listAutomationValues, () => store.automationValues.list()),
    createAutomationValue: bound(E.createAutomationValue, ({ body }) =>
      valueWrite(() => store.automationValues.create(body.content)),
    ),
    updateAutomationValue: bound(E.updateAutomationValue, ({ params, body }) =>
      valueWrite(() =>
        store.automationValues.update(params.valueId, body.content, body.expectedRevision),
      ),
    ),
    applyAutomationValueOperation: bound(E.applyAutomationValueOperation, ({ params, body }) =>
      valueWrite(() => store.automationValues.apply(params.valueId, body)),
    ),
    removeAutomationValue: bound(E.removeAutomationValue, ({ params }) => {
      store.automationValues.remove(params.valueId);
      return DONE_REPLY;
    }),
    listAutomationRuns: bound(E.listAutomationRuns, ({ query }) =>
      store.automationRuns.list(query.automationId),
    ),
    readAutomationRun: bound(E.readAutomationRun, ({ params }) =>
      store.automationRuns.byId(params.runId),
    ),
    stopAutomationRun: bound(E.stopAutomationRun, ({ params }) =>
      hub.stopAutomationRun(params.runId),
    ),
    stopAutomationRuns: bound(E.stopAutomationRuns, ({ params, body }) => {
      store.automations.byId(params.automationId);
      hub.stopAutomationRuns(params.automationId, body.key);
      return DONE_REPLY;
    }),
  }) as const;
