import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { KindCatalog } from '../../automations/plugin-kinds/catalog';
import type { ServerContext } from '../context';
import { bound, DONE_REPLY } from '../router';
import { valueWrite } from './automation-value-units';

export const automationValueRoutes = (
  { store }: Pick<ServerContext, 'store'>,
  kinds: KindCatalog,
) =>
  ({
    listAutomationValues: bound(E.listAutomationValues, () =>
      store.host.call('automationValues', 'list'),
    ),
    createAutomationValue: bound(E.createAutomationValue, ({ body }) =>
      store.host.write('automationValueCreate', { content: body.content }),
    ),
    updateAutomationValue: bound(E.updateAutomationValue, ({ params, body }) =>
      valueWrite(() =>
        store.automationValues.update(params.valueId, body.content, kinds, body.expectedRevision),
      ),
    ),
    applyAutomationValueOperation: bound(E.applyAutomationValueOperation, ({ params, body }) =>
      store.host.write('automationValueApply', { valueId: params.valueId, operation: body }),
    ),
    removeAutomationValue: bound(E.removeAutomationValue, ({ params }) => {
      store.automationValues.remove(params.valueId, kinds);
      return DONE_REPLY;
    }),
  }) as const;
