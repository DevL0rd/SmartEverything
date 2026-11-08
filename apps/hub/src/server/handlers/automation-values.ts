import { API_ENDPOINTS as E, ApiError, AutomationValueError } from '@smarteverything/domain';
import type { KindCatalog } from '../../automations/plugin-kinds/catalog';
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

export const automationValueRoutes = (
  { store }: Pick<ServerContext, 'store'>,
  kinds: KindCatalog,
) =>
  ({
    listAutomationValues: bound(E.listAutomationValues, () => store.automationValues.list()),
    createAutomationValue: bound(E.createAutomationValue, ({ body }) =>
      valueWrite(() => store.automationValues.create(body.content)),
    ),
    updateAutomationValue: bound(E.updateAutomationValue, ({ params, body }) =>
      valueWrite(() =>
        store.automationValues.update(params.valueId, body.content, kinds, body.expectedRevision),
      ),
    ),
    applyAutomationValueOperation: bound(E.applyAutomationValueOperation, ({ params, body }) =>
      valueWrite(() => store.automationValues.apply(params.valueId, body)),
    ),
    removeAutomationValue: bound(E.removeAutomationValue, ({ params }) => {
      store.automationValues.remove(params.valueId, kinds);
      return DONE_REPLY;
    }),
  }) as const;
