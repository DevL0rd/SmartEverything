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

export const automationValueRoutes = ({ store }: Pick<ServerContext, 'store'>) =>
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
  }) as const;
