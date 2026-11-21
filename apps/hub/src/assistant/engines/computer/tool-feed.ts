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
  const { deps, current, fail } = route;
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
  void routeBridgedTool(route, turn, event)
    .then(({ failed, output }) => {
      if (!current()) {
        staleTool(turn.chat.id, event);
        return;
      }
      turn.stream.tool({ ...item, state: failed ? 'failed' : 'done' }, { output });
    })
    .catch((cause: unknown) => {
      deps.log.error('claude.tool_bridge_failed', cause, { chatId: turn.chat.id });
      fail(messageOf(cause));
    });
}

async function routeBridgedTool(
  route: {
    readonly deps: ComputerRunnerDeps;
    readonly state: ProviderState;
    readonly current: () => boolean;
  },
  turn: Turn,
  event: Extract<ComputerEvent, { kind: 'tool_call' }>,
): ReturnType<typeof routeProviderTool> {
  const { deps, state, current } = route;
  const binding = await state.bound(turn.chat);
  const validation = await providerToolValidation(deps, state, turn, current);
  try {
    return await routeProviderTool(
      {
        directory: deps.directory,
        deviceId: binding.device_id,
        runtime: deps.runtime,
        grant: turn.grant,
        caller: turn.caller,
        validate: validation.validate,
        hubOsBan:
          binding.managed_project !== undefined || binding.context?.managed_project !== undefined,
      },
      event,
    );
  } finally {
    validation.stop();
  }
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
