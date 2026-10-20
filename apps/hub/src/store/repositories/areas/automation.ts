import type { StoreContext } from '../../context';
import { AiOutreachRepository } from '../ai-outreach';
import { AiWakesRepository } from '../ai-wakes';
import { AutomationDecisionsRepository } from '../automation-decisions';
import { AutomationFunctionsRepository } from '../automation-functions';
import { AutomationNodeStateRepository } from '../automation-node-state';
import { AutomationOwnedValuesRepository } from '../automation-owned-values';
import { AutomationPlansRepository } from '../automation-plans';
import { AutomationQuestionsRepository } from '../automation-questions';
import { AutomationProgramsRepository } from '../automation-programs';
import { AutomationRevisionsRepository } from '../automation-revisions';
import { AutomationRunNodesRepository } from '../automation-run-nodes';
import { AutomationRunRecordsRepository } from '../automation-run-records';
import { AutomationRunsRepository } from '../automation-runs';
import { AutomationTestsRepository } from '../automation-tests';
import { AutomationValuesRepository } from '../automation-values';
import { HubMarksRepository } from '../hub-marks';
import { SchedulesRepository } from '../schedules';
import { SignalWatchStateRepository } from '../signal-watch-state';
import { SpeechRepository } from '../speech';

export const automationRepositories = (context: StoreContext) =>
  ({
    automations: new AutomationProgramsRepository(context),
    automationRevisions: new AutomationRevisionsRepository(context),
    automationFunctions: new AutomationFunctionsRepository(context),
    automationPlans: new AutomationPlansRepository(context),
    automationRunRecords: new AutomationRunRecordsRepository(context, (operation, record, old) => {
      context.changed('automation_runs', operation, record, old);
    }),
    automationRunNodes: new AutomationRunNodesRepository(context),
    automationDecisions: new AutomationDecisionsRepository(context),
    automationNodeState: new AutomationNodeStateRepository(context),
    automationQuestions: new AutomationQuestionsRepository(context),
    automationTests: new AutomationTestsRepository(context),
    automationOwnedValues: new AutomationOwnedValuesRepository(context),
    speech: new SpeechRepository(context),
    automationValues: new AutomationValuesRepository(context),
    automationRuns: new AutomationRunsRepository(context),
    signalWatchState: new SignalWatchStateRepository(context),
    schedules: new SchedulesRepository(context),
    hubMarks: new HubMarksRepository(context),
    aiWakes: new AiWakesRepository(context),
    aiOutreach: new AiOutreachRepository(context),
  }) as const;
