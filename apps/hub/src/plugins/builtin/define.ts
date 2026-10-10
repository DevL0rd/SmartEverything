import { issuesOf, jsonSchemaOf } from '../../extensions/mcp/tools/registry';
import { failure, type HubToolResult } from '../../ai-tools/hub-tool';
import type {
  BuiltinPlugin,
  BuiltinPluginDefinition,
  BuiltinStart,
  PluginTool,
  PluginToolDefinition,
} from './contract';

export function definePluginTool<I>(definition: PluginToolDefinition<I>): PluginTool {
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: jsonSchemaOf(definition.input, 'input'),
    annotations: definition.annotations,
    humanOnly: definition.humanOnly,
    validate: (raw): string | null => {
      const parsed = definition.input.safeParse(raw);
      return parsed.success ? null : `The arguments are not valid: ${issuesOf(parsed.error)}`;
    },
    run: async (raw, caller): Promise<HubToolResult> => {
      const parsed = definition.input.safeParse(raw);
      return parsed.success
        ? definition.run(parsed.data, caller)
        : failure(`The arguments are not valid: ${issuesOf(parsed.error)}`);
    },
  };
}

export function defineBuiltinPlugin<S>(definition: BuiltinPluginDefinition<S>): BuiltinPlugin {
  return {
    manifest: definition.manifest,
    validate: (raw): string | null => {
      const parsed = definition.settings.safeParse(raw);
      return parsed.success ? null : `The settings are not valid: ${issuesOf(parsed.error)}`;
    },
    start: async (context, raw): Promise<BuiltinStart> => {
      const parsed = definition.settings.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, reason: `The settings are not valid: ${issuesOf(parsed.error)}` };
      }
      const { watchSettings, ...rest } = context;
      const stop = await definition.start({
        ...rest,
        settings: parsed.data,
        settingsChanged: (listener) =>
          watchSettings((changed): void => {
            const next = definition.settings.safeParse(changed);
            if (next.success) {
              listener(next.data);
            } else {
              context.log.error('plugin.settings_invalid', next.error);
            }
          }),
      });
      return { ok: true, stop };
    },
  };
}
