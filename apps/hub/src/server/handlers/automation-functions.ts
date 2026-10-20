import { AUTOMATION_FUNCTION_ENDPOINTS as E } from '@smarteverything/domain';
import type { AutomationFunctions } from '../../automations/service-functions';
import { DONE_REPLY, bound } from '../router';

export const automationFunctionRoutes = (functions: AutomationFunctions) =>
  ({
    listAutomationFunctions: bound(E.listAutomationFunctions, ({ caller }) =>
      functions.list(caller),
    ),
    getAutomationFunction: bound(E.getAutomationFunction, ({ params, caller }) =>
      functions.get(caller, params.functionId),
    ),
    createAutomationFunction: bound(E.createAutomationFunction, ({ body, caller }) =>
      functions.create(caller, body),
    ),
    saveAutomationFunction: bound(E.saveAutomationFunction, ({ params, body, caller }) =>
      functions.save(caller, params.functionId, body),
    ),
    updateAutomationFunctionCallers: bound(
      E.updateAutomationFunctionCallers,
      ({ params, body, caller }) =>
        functions.updateCallers(caller, params.functionId, body.mapping),
    ),
    extractAutomationFunction: bound(E.extractAutomationFunction, ({ body, caller }) =>
      functions.extract(caller, body),
    ),
    removeAutomationFunction: bound(E.removeAutomationFunction, ({ params, caller }) => {
      functions.remove(caller, params.functionId);
      return DONE_REPLY;
    }),
  }) as const;
