import {
  API_ENDPOINTS as E,
  HUB_COMMAND,
  type CommandRow,
  type HubCommand,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.hub-commands');

export async function sendHubCommand(command: HubCommand): Promise<CommandRow> {
  const checked = HUB_COMMAND.parse(command);
  const row = await api().call(E.sendCommand, {
    body: { device_id: null, capability: checked.capability, value: checked.value },
  });
  log.info('hub_command.sent', { commandId: row.id, capability: row.capability });
  return row;
}
