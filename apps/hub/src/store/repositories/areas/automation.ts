import type { StoreContext } from '../../context';
import { AiOutreachRepository } from '../ai-outreach';
import { AiWakesRepository } from '../ai-wakes';
import { AutomationRunsRepository } from '../automation-runs';
import { AutomationValuesRepository } from '../automation-values';
import { AutomationsRepository } from '../automations';
import { SchedulesRepository } from '../schedules';
import { SpeechRepository } from '../speech';

export const automationRepositories = (context: StoreContext) =>
  ({
    automations: new AutomationsRepository(context),
    speech: new SpeechRepository(context),
    automationValues: new AutomationValuesRepository(context),
    automationRuns: new AutomationRunsRepository(context),
    schedules: new SchedulesRepository(context),
    aiWakes: new AiWakesRepository(context),
    aiOutreach: new AiOutreachRepository(context),
  }) as const;
