import type { ToolHub } from '../ai-tools/tool-hub';
import { decisionView } from '../automations/decision-view';
import { automationFunctions } from '../automations/service-functions';
import { automationPrograms } from '../automations/service-programs';
import type { ProgramEnv } from '../automations/service-programs';
import {
  hostAutomationDecisions,
  hostAutomationPrograms,
  hostAutomationTests,
  hostRunNodes,
  hostRunRecords,
} from '../store/host/hosted';
import type { ServerContext } from './context';
import { automationFunctionRoutes } from './handlers/automation-functions';
import { automationProgramReadRoutes } from './handlers/automation-program-reads';
import { automationProgramRoutes } from './handlers/automation-programs';
import { automationQuestionRoutes } from './handlers/automation-questions';
import { automationRunRoutes } from './handlers/automation-runs';
import { automationSecretRoutes } from './handlers/automation-secrets';
import { automationValueRoutes } from './handlers/automation-values';
import { clientRoutes } from './handlers/client-settings';

export type AutomationRoutes = ReturnType<typeof automationValueRoutes> &
  ReturnType<typeof automationProgramRoutes> &
  ReturnType<typeof automationProgramReadRoutes> &
  ReturnType<typeof automationFunctionRoutes> &
  ReturnType<typeof automationSecretRoutes> &
  ReturnType<typeof automationRunRoutes> &
  ReturnType<typeof automationQuestionRoutes> &
  ReturnType<typeof clientRoutes>;

export function automationRoutes(context: ServerContext, tools: ToolHub): AutomationRoutes {
  const { store, hub } = context;
  const env: ProgramEnv = {
    store,
    secrets: hub.automationSecrets,
    kinds: hub.automationKinds,
    tools,
    engine: hub.automationEngine,
  };
  const functions = automationFunctions(env);
  return {
    ...automationValueRoutes(context, hub.automationKinds),
    ...automationProgramRoutes(automationPrograms(env)),
    ...automationProgramReadRoutes({
      store,
      secrets: hub.automationSecrets,
      functions,
      kinds: hub.automationKinds,
    }),
    ...automationFunctionRoutes(functions),
    ...automationSecretRoutes(hub.automationSecrets),
    ...automationRunRoutes({
      store,
      programs: hostAutomationPrograms(store.host),
      records: hostRunRecords(store.host),
      nodes: hostRunNodes(store.host),
      decisions: decisionView(hostAutomationDecisions(store.host), (automationId) =>
        hub.automationEngine.driver.pendingDecisions(automationId),
      ),
      tests: hostAutomationTests(store.host),
      engine: hub.automationEngine,
      rehearsals: hub.automationRehearsals,
    }),
    ...automationQuestionRoutes({ store, questions: hub.automationQuestions }),
    ...clientRoutes(store, hub.phones),
  };
}
