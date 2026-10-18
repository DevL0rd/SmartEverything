import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from '../src/api/endpoints';
import { MCP_OPERATION_TOOLS } from '../src/mcp/names';
import { MCP_UNAVAILABLE_OPERATIONS, mcpOperationTraits } from '../src/mcp/operations';
import { currentToolCall } from '../src/mcp/retired-tools';
import { MCP_ROUTES, isMcpToolName } from '../src/mcp/served';

const RETIRED = [
  'get_device_groups',
  'start_automation',
  'start_automation_sequence',
  'stop_automation_sequence',
  'list_automation_sequences',
  'read_automation_sequence',
  'remove_automation_sequence',
  'stop_automation_run',
  'stop_automation_runs',
  'read_automation_revision',
  'list_automation_runs',
  'read_automation_run',
  'list_automation_values',
  'create_automation_value',
  'update_automation_value',
  'remove_automation_value',
  'apply_automation_value_operation',
  'schedule',
  'update_device',
  'call',
  'delete_transcripts',
  'update_transcript_settings',
  'write_project_files',
  'remove_project_files',
  'publish_html',
  'publish_project_preview',
  'revoke_shared_preview',
  'start_image_operation',
  'cancel_image_operation',
  'resolve_image_input',
  'wait_for_images',
  'claude_start',
  'claude_session',
  'claude_answer',
  'read_claude_cli',
  'search_preview_logs',
] as const;

const KEYED_RENAMES = [
  ['log_food', { what: 'water' }, { action: 'water' }],
  ['get_settings', { area: 'firewall' }, { view: 'firewall' }],
  ['update_settings', { area: 'weather' }, { action: 'weather' }],
  ['read_files', { kind: 'folder', deviceId: 'd1' }, { view: 'folder', deviceId: 'd1' }],
] as const;

function branchOf(name: string, args: Readonly<Record<string, unknown>>): string | undefined {
  const route = isMcpToolName(name) ? MCP_ROUTES.get(name) : undefined;
  if (route === undefined || !('key' in route)) return undefined;
  const value = args[route.key];
  return typeof value === 'string' ? value : undefined;
}

describe('retired tool names', () => {
  it.each(RETIRED)('%s resolves to a served tool and a branch it really has', (name) => {
    const call = currentToolCall(name, { automationId: 'a1', view: 'sessions' });
    expect(isMcpToolName(call.name)).toBe(true);
    const value = branchOf(call.name, call.arguments);
    const route = isMcpToolName(call.name) ? MCP_ROUTES.get(call.name) : undefined;
    if (value !== undefined && route !== undefined && 'key' in route) {
      expect(Object.keys(route.parts), name).toContain(value);
    }
  });

  it('keeps the arguments and adds the branch that the old name stood for', () => {
    expect(currentToolCall('stop_automation_run', { runId: 'r1' })).toStrictEqual({
      name: 'stop_automation',
      arguments: { runId: 'r1', action: 'run' },
    });
    expect(currentToolCall('apply_automation_value_operation', { valueId: 'v1' })).toStrictEqual({
      name: 'edit_value',
      arguments: { valueId: 'v1', action: 'apply' },
    });
    expect(currentToolCall('write_project_files', { chatId: 'c1' })).toStrictEqual({
      name: 'edit_project_files',
      arguments: { chatId: 'c1', action: 'write' },
    });
  });

  it('renames the arguments a sequence tool or the old key used', () => {
    expect(
      currentToolCall('stop_automation_runs', { automationId: 'a1', controlKey: 'night' }),
    ).toStrictEqual({
      name: 'stop_automation',
      arguments: { automationId: 'a1', key: 'night', action: 'automation' },
    });
    expect(
      currentToolCall('start_automation_sequence', { sequenceId: 's1', parameters: { n: 1 } }),
    ).toStrictEqual({
      name: 'run_automation',
      arguments: { automationId: 's1', inputs: { n: 1 } },
    });
    expect(
      currentToolCall('remove_automation_sequence', {
        sequenceId: 's1',
        expectedRevision: 'f'.repeat(64),
      }),
    ).toStrictEqual({
      name: 'edit_automation',
      arguments: { automationId: 's1', action: 'remove' },
    });
    expect(currentToolCall('read_automation_sequence', { sequenceId: 's1' })).toStrictEqual({
      name: 'list_automations',
      arguments: {},
    });
    expect(currentToolCall('list_automation_sequences', {})).toStrictEqual({
      name: 'list_automations',
      arguments: {},
    });
    expect(currentToolCall('update_device', { what: 'camera', deviceId: 'd1' })).toStrictEqual({
      name: 'edit_device',
      arguments: { action: 'camera', deviceId: 'd1' },
    });
  });

  it.each(KEYED_RENAMES)('moves the old selector key of %s to its new key', (name, old, now) => {
    expect(currentToolCall(name, old)).toStrictEqual({ name, arguments: now });
  });

  it('maps the owned Claude CLI views onto the merged read_claude views', () => {
    expect(currentToolCall('read_claude_cli', { view: 'sessions', deviceId: 'd1' })).toStrictEqual({
      name: 'read_claude',
      arguments: { view: 'cli_sessions', deviceId: 'd1' },
    });
    expect(currentToolCall('read_claude', { view: 'sessions' })).toStrictEqual({
      name: 'read_claude',
      arguments: { view: 'sessions' },
    });
  });

  it('folds the preview log search into the log reader and defaults a plain read', () => {
    expect(currentToolCall('search_preview_logs', { chatId: 'c1', text: 'x' })).toStrictEqual({
      name: 'read_preview_logs',
      arguments: { chatId: 'c1', text: 'x', view: 'search' },
    });
    expect(currentToolCall('read_preview_logs', { chatId: 'c1' })).toStrictEqual({
      name: 'read_preview_logs',
      arguments: { view: 'read', chatId: 'c1' },
    });
    expect(currentToolCall('read_preview_logs', { chatId: 'c1', view: 'search' })).toStrictEqual({
      name: 'read_preview_logs',
      arguments: { chatId: 'c1', view: 'search' },
    });
  });

  it('answers the person and camera ids under their one name on every served tool', () => {
    expect(currentToolCall('read_health', { view: 'types', profileId: 'p1' })).toStrictEqual({
      name: 'read_health',
      arguments: { view: 'types', personId: 'p1' },
    });
    expect(currentToolCall('read_usage', { view: 'totals', profileIds: ['p1'] })).toStrictEqual({
      name: 'read_usage',
      arguments: { view: 'totals', personIds: ['p1'] },
    });
    expect(currentToolCall('call_sight', { action: 'stop', cameraId: 'c1' })).toStrictEqual({
      name: 'call_sight',
      arguments: { action: 'stop', deviceId: 'c1' },
    });
    expect(currentToolCall('call', { profileId: 'p1' })).toStrictEqual({
      name: 'call_person',
      arguments: { personId: 'p1' },
    });
  });

  it('leaves the arguments of a tool that is not served alone, such as a plugin tool', () => {
    const args = { profileId: 'p1', cameraId: 'c1' };
    expect(currentToolCall('plugin__lamp__set', args)).toStrictEqual({
      name: 'plugin__lamp__set',
      arguments: args,
    });
  });

  it('leaves a current name and its arguments alone', () => {
    const args = { automationId: 'a1' };
    expect(currentToolCall('run_automation', args)).toStrictEqual({
      name: 'run_automation',
      arguments: args,
    });
  });
});

describe('operation traits', () => {
  it('name real operations that an assistant can call', () => {
    const tooled = new Set(MCP_OPERATION_TOOLS.map(([, operation]) => operation));
    for (const operation of tooled) {
      expect(MCP_UNAVAILABLE_OPERATIONS[operation], operation).toBeUndefined();
      expect(API_ENDPOINTS[operation], operation).toBeDefined();
    }
  });

  it('mark a read through POST as read only and idempotent, never destructive', () => {
    expect(mcpOperationTraits('readAiProjectFiles').hints).toStrictEqual({
      readOnlyHint: true,
      idempotentHint: true,
    });
  });

  it('say which operation returns a picture and which ones answer instead of report', () => {
    expect(mcpOperationTraits('capturePreviewViewport').returnsImage).toBe(true);
    expect(mcpOperationTraits('readPreviewLogs').returnsImage).toBeUndefined();
    expect(mcpOperationTraits('askAiChat').answers).toBe(true);
    expect(mcpOperationTraits('listDevices')).toStrictEqual({});
  });
});
