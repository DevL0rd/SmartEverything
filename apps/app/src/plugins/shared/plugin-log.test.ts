import { describe, expect, it } from 'vitest';
import { assertEventName } from '@smarteverything/logging';
import { failureKind } from './plugin-log';

const EVENTS = [
  'plugin_tool.started',
  'plugin_tool.finished',
  'plugin_tool.failed',
  'plugin_tool.reply_invalid',
  'plugin_tool.surfaced',
  'plugin_query.fetched',
  'plugin_query.invalidated',
  'plugin_screen.mounted',
  'plugin_screen.unmounted',
  'plugin_stream.subscribed',
  'plugin_stream.unsubscribed',
  'plugin_stream.invalid',
  'plugin_stream.state_changed',
  'plugin_stream.summary',
  'plugin_widget.summary',
  'plugin_action.pressed',
  'plugin_action.declined',
  'plugin_action.finished',
  'plugin_action.failed',
  'master_command.started',
  'master_command.accepted',
  'master_command.settled',
  'master_command.failed',
  'group_edit.started',
  'group_edit.saved',
  'group_edit.failed',
  'group_edit.skipped',
  'group_remove.confirmed',
  'setting_write.started',
  'setting_write.finished',
  'setting_write.failed',
  'transcript_removal.confirmed',
  'transcript_removal.finished',
  'transcript_removal.failed',
  'transcript_chunk.read',
  'transcript_chunk.failed',
  'transcript_sessions.listed',
  'transcript_sessions.failed',
  'log_level.changed',
  'developer_flags.loaded',
  'developer_flags.load_failed',
  'developer_flags.stored',
  'activity_screen.mounted',
  'activity_screen.unmounted',
  'activity_screen.filtered',
  'watch_workout_probe.started',
  'watch_workout_probe.finished',
  'watch_workout_probe.failed',
];

describe('plugin logging', () => {
  it('uses valid event names', () => {
    for (const event of EVENTS) expect(() => assertEventName(event)).not.toThrow();
  });

  it('describes a failure without throwing for any value', () => {
    expect(failureKind(new TypeError('x'))).toEqual({ kind: 'TypeError', message: 'x' });
    expect(failureKind('text')).toEqual({ kind: 'string', message: '' });
  });
});
