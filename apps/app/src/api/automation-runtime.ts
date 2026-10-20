import {
  API_ENDPOINTS as E,
  type AutomationValueContent,
  type AutomationValueRow,
  type AutomationValueOperation,
} from '@smarteverything/domain';
import { api } from './transport';

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
