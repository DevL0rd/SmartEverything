import type { ChatToolItem } from '@smarteverything/domain';
import type { ComputerRunnerDeps, Turn } from './ports';
import type { ProviderState, ComputerEvent } from './provider-state';
import { providerToolValidation } from './tool-validation';
import { routeProviderTool } from './tool-bridge';
import { duplicateTool, nativeTool, staleTool } from './tool-trace';
import { messageOf } from '@smarteverything/logging';
export function bridgeTool(
  route: {
    readonly deps: ComputerRunnerDeps;
    readonly state: ProviderState;
    readonly current: () => boolean;
    readonly fail: (reason: string) => void;
  },
  turn: Turn,
  event: Extract<ComputerEvent, { kind: 'tool_call' }>,
): void {
  const { deps, state, current, fail } = route;
  const item = toolItem(event);
  if ('origin' in event && event.origin !== 'hub') {
    turn.stream.tool(item, { input: event.input });
    nativeTool(turn.chat.id, event);
    return;
  }
  if (turn.calls.has(event.call_id)) {
    duplicateTool(turn.chat.id, event);
    return;
  }
  turn.calls.add(event.call_id);
  turn.stream.tool(item, { input: event.input });
  const binding = state.bound(turn.chat);
  void routeProviderTool(
    {
      directory: deps.directory,
      deviceId: binding.device_id,
      runtime: deps.runtime,
      grant: turn.grant,
      caller: turn.caller,
      validate: providerToolValidation(deps, state, turn, current),
      hubOsBan:
        binding.managed_project !== undefined || binding.context?.managed_project !== undefined,
    },
    event,
  )
    .then(({ line, failed, output }) => {
      if (!current()) {
        staleTool(turn.chat.id, event);
        return;
      }
      if (line !== '') deps.conversation.action(turn.chat, line);
      turn.stream.tool({ ...item, state: failed ? 'failed' : 'done' }, { output });
    })
    .catch((cause: unknown) => {
      deps.log.error('claude.tool_bridge_failed', cause, { chatId: turn.chat.id });
      fail(messageOf(cause));
    });
}

export function receiveToolResult(
  turn: Turn,
  event: Extract<ComputerEvent, { kind: 'tool_result' }>,
): void {
  const item = turn.stream.current().tools.find((tool) => tool.callId === event.call_id);
  if (item === undefined) return;
  turn.stream.tool({ ...item, state: event.failed ? 'failed' : 'done' }, { output: event.text });
}

function toolItem(event: Extract<ComputerEvent, { kind: 'tool_call' }>): ChatToolItem {
  return {
    callId: event.call_id,
    name: event.name,
    title: event.name,
    state: 'running',
    detail: null,
  };
}
