import {
  deleteSession,
  forkSession,
  renameSession,
  tagSession,
  type Query,
} from '@anthropic-ai/claude-agent-sdk';
import {
  JSON_VALUE,
  type ProviderControl,
  type JsonValue,
  type ClaudeMcpServers,
} from '@smarteverything/domain';
import { z } from 'zod';
import { ProviderInputError } from './input';
import { flagSettings } from './settings';

const USER_SETTINGS = z.strictObject({
  effortLevel: z.enum(['low', 'medium', 'high', 'xhigh']).optional(),
});
const LOCAL_SETTINGS = z.strictObject({ outputStyle: z.string().min(1) });

export function jsonOf(value: unknown): JsonValue {
  if (value === undefined) {
    return null;
  }
  const json: unknown = JSON.parse(JSON.stringify(value));
  return JSON_VALUE.parse(json);
}

export interface ProviderControlTarget {
  readonly query: Query;
  readonly setMcpServers: (servers: ClaudeMcpServers) => Promise<JsonValue>;
  readonly cwd: string;
  readonly session: string;
  readonly stop: () => void;
  readonly owns: (sessionId: string) => boolean;
  readonly remember: (sessionId: string) => Promise<void>;
}

export async function controlProvider(
  target: ProviderControlTarget,
  control: ProviderControl,
): Promise<JsonValue> {
  if (control.action === 'set_mcp_servers') return target.setMcpServers(control.servers);
  if ('session_id' in control) return sessionControl(target, control);
  if (control.action === 'apply_flags') {
    await target.query.applyFlagSettings(flagSettings(control.values));
    return null;
  }
  if (control.action === 'update_settings') {
    await target.query.updateSettings(
      control.source,
      control.source === 'userSettings'
        ? USER_SETTINGS.parse(control.values)
        : LOCAL_SETTINGS.parse(control.values),
    );
    return null;
  }
  if (extendedControl(control)) return extendedQueryControl(target, control);
  return queryControl(target, control);
}

async function queryControl(
  target: ProviderControlTarget,
  control: Exclude<
    ProviderControl,
    | { session_id: string }
    | { action: 'apply_flags' | 'update_settings' | 'set_mcp_servers' }
    | ExtendedControl
  >,
): Promise<JsonValue> {
  switch (control.action) {
    case 'set_model':
      await target.query.setModel(control.model);
      return null;
    case 'set_permission_mode':
      await target.query.setPermissionMode(control.mode);
      return null;
    case 'stop_task':
      await target.query.stopTask(control.task_id);
      return null;
    case 'close':
      target.stop();
      return { closed: true };
    case 'reinitialize': {
      const { account: _account, ...initialization } = await target.query.reinitialize();
      return jsonOf(initialization);
    }
    case 'reconnect_mcp':
      await target.query.reconnectMcpServer(control.server);
      return null;
    case 'toggle_mcp':
      await target.query.toggleMcpServer(control.server, control.enabled);
      return null;
    case 'read_mcp_resource':
      return jsonOf(await target.query.readMcpResource(control.server, control.uri));
    case 'cancel_message':
      throw new ProviderInputError(
        'The installed public SDK Query API does not expose individual queued-message cancellation. Interrupt or close this owned job.',
      );
  }
}

async function sessionControl(
  target: ProviderControlTarget,
  control: Extract<ProviderControl, { session_id: string }>,
): Promise<JsonValue> {
  if (!target.owns(control.session_id)) {
    throw new ProviderInputError('The session is not owned by this SmartEverything provider.');
  }
  const options = { dir: target.cwd };
  switch (control.action) {
    case 'rename_session':
      await renameSession(control.session_id, control.title, options);
      return { renamed: true };
    case 'tag_session':
      await tagSession(control.session_id, control.tag, options);
      return { tagged: true };
    case 'delete_session':
      if (target.session === control.session_id) target.stop();
      await deleteSession(control.session_id, options);
      return { deleted: true };
    case 'fork_session': {
      const forked = await forkSession(control.session_id, {
        ...options,
        ...(control.through_message_id === undefined
          ? {}
          : { upToMessageId: control.through_message_id }),
      });
      await target.remember(forked.sessionId);
      return jsonOf(forked);
    }
  }
}

type ExtendedControl = Extract<
  ProviderControl,
  {
    action:
      | 'seed_read_state'
      | 'set_thinking'
      | 'set_mcp_permission_mode'
      | 'rewind_files'
      | 'background_tasks'
      | 'reload_plugins'
      | 'reload_skills'
      | 'reload_output_styles';
  }
>;
const EXTENDED_ACTIONS = new Set([
  'seed_read_state',
  'set_thinking',
  'set_mcp_permission_mode',
  'rewind_files',
  'background_tasks',
  'reload_plugins',
  'reload_skills',
  'reload_output_styles',
]);
function extendedControl(control: ProviderControl): control is ExtendedControl {
  return EXTENDED_ACTIONS.has(control.action);
}
async function extendedQueryControl(
  target: ProviderControlTarget,
  control: ExtendedControl,
): Promise<JsonValue> {
  switch (control.action) {
    case 'seed_read_state':
      await target.query.seedReadState(control.path, control.mtime);
      return null;
    case 'set_thinking':
      throw new ProviderInputError(
        'The installed SDK deprecates changing thinking limits in an active query. Start or resume a turn with the supported thinking and thinking_display options.',
      );
    case 'set_mcp_permission_mode':
      return jsonOf(await target.query.setMcpPermissionModeOverride(control.server, control.mode));
    case 'rewind_files':
      return jsonOf(
        await target.query.rewindFiles(control.message_id, { dryRun: control.dry_run }),
      );
    case 'background_tasks':
      return jsonOf(await target.query.backgroundTasks(control.tool_use_id));
    case 'reload_plugins':
      return jsonOf(
        await target.query.reloadPlugins({ holdOnCacheImpact: control.hold_on_cache_impact }),
      );
    case 'reload_skills':
      return jsonOf(await target.query.reloadSkills());
    case 'reload_output_styles':
      return jsonOf(await target.query.reloadOutputStyles());
  }
}
