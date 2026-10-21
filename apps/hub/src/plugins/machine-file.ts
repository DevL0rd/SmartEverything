import { FILE_CONTENT } from '@smarteverything/domain';
import type { ToolHub } from '../ai-tools/tool-hub';
import { resolveMachine } from '../harness/machines';
import type { HarnessService } from '../harness/service';
import type { PluginFiles } from './builtin/contract';

export function machineFileReader(ports: {
  readonly tools: ToolHub;
  readonly harness: HarnessService;
}): PluginFiles['fromMachine'] {
  return async (caller, input) => {
    const host = resolveMachine(ports.harness.directory.visible(caller.role, ''), input.machine);
    if (host.target.kind === 'server') return null;
    const result = await ports.tools.call(
      'file_read',
      { view: 'file', deviceId: host.target.device_id, path: input.path },
      caller,
    );
    const file = FILE_CONTENT.parse(result.response);
    return {
      data: Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'),
      name: file.name,
    };
  };
}
