import {
  API_ENDPOINTS as E,
  type AutomationDefinition,
  type CommandInput,
  type EventRow,
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
  readonly definition: AutomationDefinition;
}

export async function saveAutomation(save: AutomationSave): Promise<string> {
  const fields = { name: save.name, enabled: save.enabled, definition: save.definition };
  const saved =
    save.automationId === null
      ? await api().call(E.createAutomation, { body: fields })
      : await api().call(E.updateAutomation, {
          params: { automationId: save.automationId },
          body: fields,
        });
  log.info('automation.saved', { automationId: saved.id, created: save.automationId === null });
  return saved.id;
}

export async function deleteAutomation(automationId: string): Promise<void> {
  await api().call(E.removeAutomation, { params: { automationId } });
  log.info('automation.deleted', { automationId });
}

export interface AutomationCommand {
  readonly deviceId: string;
  readonly capability: string;
  readonly value: JsonValue;
  readonly source: 'automation' | 'scene';
}

export async function sendAutomationCommands(
  name: string,
  commands: readonly AutomationCommand[],
): Promise<void> {
  const inputs: CommandInput[] = commands.map((command) => ({
    device_id: command.deviceId,
    capability: command.capability,
    value: command.value,
    source: command.source,
  }));
  await api().call(E.sendCommands, { body: { commands: inputs } });
  log.info('automation.test_step_sent', { name, commands: commands.length });
}

export const RUN_PAGE = 100;

export async function listAutomationRunEvents(before: string | null): Promise<EventRow[]> {
  return api().call(E.listEvents, {
    query: {
      kinds: ['automation_run'],
      limit: RUN_PAGE,
      ...(before === null ? {} : { to: before }),
    },
  });
}
