import { ROBOT_ACTIVITY_KINDS, type RobotMoves, type RobotStatus } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { failure, type HubToolResult } from '../../../ai-tools/hub-tool';
import type { PluginAssistant, PluginTool } from '../contract';
import { definePluginTool } from '../define';
import {
  attemptTool,
  DANGER_HINTS,
  NO_INPUT,
  READ_HINTS,
  toolResult,
  WRITE_HINTS,
} from '../tool-kit';
import type { ActivityLog } from './activity';
import { ROBOT_CONVERSATION } from './assistant-commands';
import { ACT_INPUT, ACT_TOOL, optionsOf, REFUSED_CODE } from './automation-tools';
import { RobotActionNotEnabledError, RobotActionParamError } from './catalogue';
import type { VoiceDesk } from './desk';
import { NOT_IN_CONVERSATION } from './robot-device';
import { REPLY_TOOL_NAME, TASK_TEXT_MAX } from './tasks';

export interface AibiToolsHost {
  readonly status: () => RobotStatus;
  readonly moves: () => RobotMoves;
  readonly activity: Pick<ActivityLog, 'recent'>;
  readonly desk: Pick<VoiceDesk, 'result' | 'playAction'>;
  readonly assistant: Pick<PluginAssistant, 'startOver'>;
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

function readTool(host: AibiToolsHost): PluginTool {
  return definePluginTool({
    name: 'read',
    title: 'Look at the AIBI robot',
    description:
      'Look at AIBI, the small robot companion. view status: how it is connected, whether it is in a conversation, its firmware and the last things said. view activity: what it heard, said, did and asked the server, newest last (kind and limit narrow it). view actions: the native moves it may use, with their options. To make it speak use speak with its device as the target; to make it move send its Move or act control (an action and options object) with device_control, which only works while it is in a conversation.',
    input: READ,
    annotations: READ_HINTS,
    humanOnly: false,
    run: (input): Promise<HubToolResult> =>
      attemptTool(() => {
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
      }),
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
    run: (): Promise<HubToolResult> => attemptTool(() => forgotten(host)),
  });
}

function refused(message: string): HubToolResult {
  return failure(message, { code: REFUSED_CODE });
}

function played(host: AibiToolsHost, input: z.output<typeof ACT_INPUT>): HubToolResult {
  try {
    return host.desk.playAction(input.action, optionsOf(input))
      ? toolResult({ queued: true, action: input.action })
      : refused(NOT_IN_CONVERSATION);
  } catch (cause) {
    if (cause instanceof RobotActionNotEnabledError || cause instanceof RobotActionParamError) {
      return refused(cause.message);
    }
    return failure(messageOf(cause));
  }
}

function actTool(host: AibiToolsHost): PluginTool {
  return definePluginTool({
    name: ACT_TOOL.name,
    title: 'Make AIBI move or act',
    description:
      'Makes AIBI do one of its native actions (dance, sing, take a photo, set its volume, show a mood). It only works while AIBI is in a conversation; otherwise it is refused. volume and mood are options of the Set volume and Express a mood actions.',
    input: ACT_INPUT,
    annotations: WRITE_HINTS,
    humanOnly: false,
    run: (input): Promise<HubToolResult> => Promise.resolve(played(host, input)),
  });
}

export function aibiTools(host: AibiToolsHost): PluginTool[] {
  return [readTool(host), replyTool(host), forgetTool(host), actTool(host)];
}
