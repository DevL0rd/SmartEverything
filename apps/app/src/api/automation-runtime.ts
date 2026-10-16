import {
  API_ENDPOINTS as E,
  type AutomationRow,
  type AutomationValueContent,
  type AutomationValueRow,
  type AutomationValueOperation,
  type AutomationRunRow,
  type AutomationSequenceDefinition,
  type AutomationSequenceRow,
  type JsonValue,
} from '@smarteverything/domain';
import { api } from './transport';

export async function readAutomationRevision(
  automationId: string,
): Promise<{ readonly automation: AutomationRow; readonly definitionRevision: string }> {
  return api().call(E.readAutomationRevision, { params: { automationId } });
}

export async function saveValue(
  content: AutomationValueContent,
  row: AutomationValueRow | null,
): Promise<AutomationValueRow> {
  return row === null
    ? api().call(E.createAutomationValue, { body: { content } })
    : api().call(E.updateAutomationValue, {
        params: { valueId: row.id },
        body: { content, expectedRevision: row.revision },
      });
}

export async function operateValue(
  valueId: string,
  operation: AutomationValueOperation,
): Promise<AutomationValueRow> {
  return api().call(E.applyAutomationValueOperation, { params: { valueId }, body: operation });
}

export async function removeValue(valueId: string): Promise<void> {
  await api().call(E.removeAutomationValue, { params: { valueId } });
}

export async function startOwnedRun(automationId: string): Promise<AutomationRunRow> {
  return api().call(E.startAutomation, { params: { automationId }, query: { runDetails: true } });
}

export async function readOwnedRun(runId: string): Promise<AutomationRunRow> {
  return api().call(E.readAutomationRun, { params: { runId }, query: { runDetails: true } });
}

export async function stopOwnedRun(runId: string): Promise<AutomationRunRow> {
  return api().call(E.stopAutomationRun, { params: { runId }, query: { runDetails: true } });
}

export async function saveSequence(
  name: string,
  definition: AutomationSequenceDefinition,
  row: AutomationSequenceRow | null,
): Promise<AutomationSequenceRow> {
  return row === null
    ? api().call(E.createAutomationSequence, { body: { name, definition } })
    : api().call(E.updateAutomationSequence, {
        params: { sequenceId: row.id },
        body: { name, definition, expectedRevision: row.revision },
      });
}

export async function removeSequence(row: AutomationSequenceRow): Promise<void> {
  await api().call(E.removeAutomationSequence, {
    params: { sequenceId: row.id },
    body: { expectedRevision: row.revision },
  });
}

export async function startSequence(
  sequenceId: string,
  parameters: Record<string, JsonValue>,
): Promise<AutomationRunRow> {
  return api().call(E.startAutomationSequence, { params: { sequenceId }, body: { parameters } });
}
