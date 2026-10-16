import { automationDefinitionRevision } from '../../store/repositories/automation-revisions';
import {
  API_ENDPOINTS as E,
  ApiError,
  AutomationValueError,
  automationRunForReader,
  automationRunVisible,
} from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound, DONE_REPLY, type Bound } from '../router';

function valueWrite<T>(work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof AutomationValueError) throw new ApiError('invalid_request', cause.message);
    throw cause;
  }
}

export function automationRuntimeRoutes({
  store,
  hub,
}: Pick<ServerContext, 'store' | 'hub'>): Record<
  | 'readAutomationRevision'
  | 'listAutomationValues'
  | 'createAutomationValue'
  | 'updateAutomationValue'
  | 'applyAutomationValueOperation'
  | 'removeAutomationValue'
  | 'listAutomationRuns'
  | 'readAutomationRun'
  | 'stopAutomationRun'
  | 'stopAutomationRuns'
  | 'startAutomation',
  Bound
> {
  return {
    readAutomationRevision: bound(E.readAutomationRevision, ({ params }) => {
      const automation = store.automations.byId(params.automationId);
      return {
        automation,
        definitionRevision: automationDefinitionRevision(automation.definition),
      };
    }),
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
    ...automationRunRoutes({ store, hub }),
  };
}

function automationRunRoutes({
  store,
  hub,
}: Pick<ServerContext, 'store' | 'hub'>): Record<
  | 'listAutomationRuns'
  | 'readAutomationRun'
  | 'stopAutomationRun'
  | 'stopAutomationRuns'
  | 'startAutomation',
  Bound
> {
  return {
    listAutomationRuns: bound(E.listAutomationRuns, ({ query }) =>
      store.automationRuns
        .list(query.automationId, query.targetType)
        .filter((run) => automationRunVisible(run, query.runDetails))
        .map((run) => automationRunForReader(run, query.runDetails)),
    ),
    readAutomationRun: bound(E.readAutomationRun, ({ params, query }) =>
      automationRunForReader(store.automationRuns.byId(params.runId), query.runDetails),
    ),
    stopAutomationRun: bound(E.stopAutomationRun, ({ params, query }) =>
      automationRunForReader(hub.stopAutomationRun(params.runId), query.runDetails),
    ),
    stopAutomationRuns: bound(E.stopAutomationRuns, ({ params, body }) => {
      store.automations.byId(params.automationId);
      hub.stopAutomationRuns(params.automationId, body.controlKey);
      return DONE_REPLY;
    }),
    startAutomation: bound(E.startAutomation, async ({ params, query }) => {
      const run = await hub.startAutomation(params.automationId);
      return automationRunForReader(
        query.runDetails ? store.automationRuns.byId(run.id) : run,
        query.runDetails,
      );
    }),
  };
}
