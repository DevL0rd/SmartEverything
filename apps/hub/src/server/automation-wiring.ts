import { BUILTIN_FUNCTIONS } from '@smarteverything/domain';
import type { ToolHub } from '../ai-tools/tool-hub';
import { decisionView } from '../automations/decision-view';
import { automationFunctions } from '../automations/service-functions';
import { automationPrograms } from '../automations/service-programs';
import type { ProgramEnv } from '../automations/service-programs-analysis';
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
    programs: store.automations,
    revisions: store.automationRevisions,
    plans: store.automationPlans,
    functions: store.automationFunctions,
    secrets: hub.automationSecrets,
    tools,
  };
  const functions = automationFunctions({
    ...env,
    functions: store.automationFunctions,
    builtins: BUILTIN_FUNCTIONS,
  });
  return {
    ...automationValueRoutes(context),
    ...automationProgramRoutes(automationPrograms(env)),
    ...automationProgramReadRoutes({ store, secrets: hub.automationSecrets, functions }),
    ...automationFunctionRoutes(functions),
    ...automationSecretRoutes(hub.automationSecrets),
    ...automationRunRoutes({
      store,
      programs: store.automations,
      records: store.automationRunRecords,
      nodes: store.automationRunNodes,
      decisions: decisionView(store.automationDecisions, (automationId) =>
        hub.automationEngine.driver.pendingDecisions(automationId),
      ),
      tests: store.automationTests,
      engine: hub.automationEngine,
      rehearsals: hub.automationRehearsals,
    }),
    ...automationQuestionRoutes({ store, questions: hub.automationQuestions }),
    ...clientRoutes(store),
  };
}
