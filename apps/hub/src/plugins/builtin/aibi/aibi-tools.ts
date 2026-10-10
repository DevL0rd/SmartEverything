import { ROBOT_ACTIVITY_KINDS, type RobotMoves, type RobotStatus } from '@smarteverything/domain';
import { z } from 'zod';
import { failure, type HubToolResult } from '../../../ai-tools/hub-tool';
import type { PluginAssistant, PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { attemptTool, DANGER_HINTS, NO_INPUT, READ_HINTS, WRITE_HINTS } from '../tool-kit';
import type { ActivityLog } from './activity';
import { ROBOT_CONVERSATION } from './assistant-commands';
import type { VoiceDesk } from './desk';
import type { Scope } from './settings';
import { REPLY_TOOL_NAME, TASK_TEXT_MAX } from './tasks';

export interface AibiToolsHost {
  readonly scopes: readonly Scope[];
  readonly status: () => RobotStatus;
  readonly moves: () => RobotMoves;
  readonly activity: ActivityLog;
  readonly desk: VoiceDesk;
  readonly assistant: PluginAssistant;
}

const ACTIVITY_LIMIT_MAX = 200;
const ACTIVITY_LIMIT_DEFAULT = 50;

const READ = z.strictObject({
  view: z.enum(['status', 'activity', 'actions']),
  kind: z.enum(ROBOT_ACTIVITY_KINDS).optional(),
  limit: z.number().int().min(1).max(ACTIVITY_LIMIT_MAX).optional(),
});

const REPLY = z.strictObject({
  eventId: z.uuid(),
  text: z.string().max(TASK_TEXT_MAX * 50),
  progress: z.boolean().optional(),
});

function refused(scope: Scope, what: string): HubToolResult {
  return failure(`The plugin settings do not let the assistant ${what} (${scope} is off).`);
}

function readTool(host: AibiToolsHost): PluginTool {
  return definePluginTool({
    name: 'read',
    title: 'Look at the AIBI robot',
    description:
      'Look at AIBI, the small robot companion. view status: how it is connected, whether it is in a conversation, its firmware and the last things said. view activity: what it heard, said, did and asked the server, newest last (kind and limit narrow it). view actions: the native moves it may use, with their options. To make it speak use speak; to make it move change its Move or act control with set_device, which only works while it is in a conversation.',
    input: READ,
    annotations: READ_HINTS,
    humanOnly: false,
    run: (input): Promise<HubToolResult> => {
      if (!host.scopes.includes('aibi.read')) {
        return Promise.resolve(refused('aibi.read', 'look at AIBI'));
      }
      return attemptTool(() => {
        switch (input.view) {
          case 'status':
            return Promise.resolve({ status: host.status() });
          case 'activity':
            return Promise.resolve({
              entries: host.activity.recent(
                input.limit ?? ACTIVITY_LIMIT_DEFAULT,
                input.kind ?? null,
              ),
            });
          case 'actions':
            return Promise.resolve({ ...host.moves() });
        }
      });
    },
  });
}

function replyTool(host: AibiToolsHost): PluginTool {
  return definePluginTool({
    name: REPLY_TOOL_NAME,
    title: 'Give AIBI the answer to a request',
    description:
      'Used by the hub to give AIBI the assistant’s answer to something it asked, or a working step. The answer is spoken out loud.',
    input: REPLY,
    annotations: WRITE_HINTS,
    humanOnly: true,
    run: (input): Promise<HubToolResult> =>
      attemptTool(() =>
        Promise.resolve({
          ...host.desk.result(input.eventId, input.text, input.progress === true),
        }),
      ),
  });
}

async function forgotten(host: AibiToolsHost): Promise<Readonly<Record<string, unknown>>> {
  let chats = 0;
  while (await host.assistant.startOver(ROBOT_CONVERSATION)) {
    chats += 1;
  }
  return { forgotten: chats };
}

function forgetTool(host: AibiToolsHost): PluginTool {
  return definePluginTool({
    name: 'forget',
    title: 'Make AIBI forget its conversations',
    description:
      'Starts the robot’s conversations over: AIBI stops being reminded of anything said before. The conversations stay in the chat list as archived chats.',
    input: NO_INPUT,
    annotations: DANGER_HINTS,
    humanOnly: false,
    run: (): Promise<HubToolResult> => {
      if (!host.scopes.includes('memory.write')) {
        return Promise.resolve(refused('memory.write', 'make AIBI forget'));
      }
      return attemptTool(() => forgotten(host));
    },
  });
}

export function aibiTools(host: AibiToolsHost): PluginTool[] {
  return [readTool(host), replyTool(host), forgetTool(host)];
}
