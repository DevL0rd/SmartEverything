import { PLUGIN_OPTION, type JsonValue, type PluginOption } from '@smarteverything/domain';
import { z } from 'zod';
import type { PluginContext, PluginOptionProvider, PluginStop, PluginTool } from '../contract';
import { actionNode, automation, entity, input, ports, streamValue } from '../automation-kit';
import { optionPage } from '../automation-kit-pages';

const PLUGIN = 'openrgb';

const NOT_CONNECTED =
  'OpenRGB is not connected. Start its SDK server and check the plugin settings.';

const COMMAND_TIMEOUT = { default: 30_000, max: 120_000 } as const;

export const OPENRGB_STATUS_STREAM = 'status';

export const PROFILE_PICKER = 'profiles';

export const STATUS_TOOL_NAME = 'status';

export const LOAD_PROFILE_TOOL = {
  name: 'load_profile',
  input: z.strictObject({ name: z.string().min(1) }),
};

const PROFILE = entity(PLUGIN, {
  id: 'profile',
  title: 'OpenRGB profile',
  plural: 'OpenRGB profiles',
  options: PROFILE_PICKER,
});

const LOAD_PROFILE = actionNode({
  id: 'profile',
  version: 1,
  title: 'Load an OpenRGB profile',
  description:
    'Applies a profile saved in OpenRGB: every light changes to what the profile stored.',
  icon: 'lightbulb',
  keywords: ['openrgb', 'rgb', 'lights', 'profile', 'preset'],
  summary: 'Load the OpenRGB profile {profile}',
  tool: LOAD_PROFILE_TOOL,
  inputs: {
    profile: input(PROFILE.kind, {
      title: 'Profile',
      description: 'A profile saved in OpenRGB.',
    }),
  },
  args: { name: { port: 'profile' } },
  timeout: COMMAND_TIMEOUT,
  retry: 'idempotent',
});

const STATUS = streamValue({
  id: 'status',
  version: 1,
  title: 'OpenRGB connected',
  description: 'Whether the OpenRGB server is connected and how many lights it provides.',
  icon: 'lightbulb',
  keywords: ['openrgb', 'rgb', 'lights', 'connected', 'server'],
  summary: 'OpenRGB status',
  stream: OPENRGB_STATUS_STREAM,
  outputs: {
    connected: { kind: ports.boolean(), from: '/connected' },
    lights: { kind: ports.number({ integer: true, min: 0 }), from: '/lights' },
  },
});

export const OPENRGB_AUTOMATION = automation({
  nodes: [LOAD_PROFILE],
  values: [STATUS],
  entities: [PROFILE],
});

export function openRgbStatus(connected: boolean, lights: number): JsonValue {
  return { connected, lights };
}

const STATUS_REPLY = z.object({
  connected: z.boolean(),
  profiles: z.array(z.string()),
});

export function profileOptions(
  names: readonly string[],
  skipped: (name: string) => void,
): readonly PluginOption[] {
  const options: PluginOption[] = [];
  for (const name of names) {
    const parsed = PLUGIN_OPTION.safeParse({
      id: name,
      label: name,
      detail: null,
      color: null,
      image: null,
    });
    if (parsed.success) options.push(parsed.data);
    else skipped(name);
  }
  return options;
}

type Observed = Pick<PluginContext<unknown>, 'options' | 'tools' | 'log'>;

function profilePicker(
  statusTool: () => PluginTool | null,
  log: Observed['log'],
): PluginOptionProvider {
  return async (query, caller) => {
    const tool = statusTool();
    if (tool === null) return { state: 'unavailable', message: NOT_CONNECTED };
    const result = await tool.run({}, caller);
    const reply = STATUS_REPLY.safeParse(result.response);
    if (!reply.success) {
      const error = result.response['error'];
      return {
        state: 'unavailable',
        message: typeof error === 'string' && error !== '' ? error : NOT_CONNECTED,
      };
    }
    if (!reply.data.connected) return { state: 'unavailable', message: NOT_CONNECTED };
    return optionPage(
      profileOptions(reply.data.profiles, (name) => {
        log.warn('openrgb.profile_name_not_listable', { length: name.length });
      }),
      query,
    );
  };
}

export function startWithProfiles<C extends Observed>(
  ctx: C,
  start: (ctx: C) => PluginStop,
): PluginStop {
  let statusTool: PluginTool | null = null;
  const unregister = ctx.options.register(
    PROFILE_PICKER,
    profilePicker(() => statusTool, ctx.log),
  );
  const observed: C = {
    ...ctx,
    tools: {
      register: (tools: readonly PluginTool[]): void => {
        statusTool = tools.find((tool) => tool.name === STATUS_TOOL_NAME) ?? statusTool;
        ctx.tools.register(tools);
      },
    },
  };
  try {
    const stop = start(observed);
    return async () => {
      unregister();
      await stop();
    };
  } catch (cause) {
    unregister();
    throw cause;
  }
}
