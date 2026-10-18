import {
  API_ENDPOINTS as E,
  type AutomationRow,
  type AutomationRunRow,
  type AutomationV2,
  type JsonValue,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.automations');

export async function setAutomationEnabled(automationId: string, enabled: boolean): Promise<void> {
  await api().call(E.updateAutomation, { params: { automationId }, body: { enabled } });
  log.info('automation.toggled', { automationId, enabled });
}

export interface AutomationSave {
  readonly automationId: string | null;
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: AutomationV2;
  readonly expectedRevision?: number;
}

export async function saveAutomation(save: AutomationSave): Promise<AutomationRow> {
  const fields = { name: save.name, enabled: save.enabled, definition: save.definition };
  const saved =
    save.automationId === null
      ? await api().call(E.createAutomation, { body: fields })
      : await api().call(E.updateAutomation, {
          params: { automationId: save.automationId },
          body: {
            ...fields,
            ...(save.expectedRevision === undefined
              ? {}
              : { expectedRevision: save.expectedRevision }),
          },
        });
  log.info('automation.saved', { automationId: saved.id, created: save.automationId === null });
  return saved;
}

export async function deleteAutomation(automationId: string): Promise<void> {
  await api().call(E.removeAutomation, { params: { automationId } });
  log.info('automation.deleted', { automationId });
}

export type RunInputs = Readonly<Record<string, JsonValue>>;

export async function runAutomation(
  automationId: string,
  inputs: RunInputs = {},
): Promise<AutomationRunRow> {
  const run = await api().call(E.runAutomation, { params: { automationId }, body: { inputs } });
  log.info('automation.run_started', { automationId, runId: run.id });
  return run;
}

export async function testAutomation(
  automationId: string | null,
  definition: AutomationV2,
  inputs: RunInputs = {},
): Promise<AutomationRunRow> {
  const run = await api().call(E.testAutomation, {
    body: { definition, inputs, ...(automationId === null ? {} : { automationId }) },
  });
  log.info('automation.test_started', { runId: run.id });
  return run;
}
