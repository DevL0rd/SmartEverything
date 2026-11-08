import { describe, expect, it } from 'vitest';
import { toolDisplayName } from './tool-names';

const NO_PLUGIN = (): null => null;

describe('toolDisplayName', () => {
  it('gives the goal, loop, agent and terminal tools plain titles', () => {
    const titles = [
      'get_goal',
      'create_goal',
      'update_goal',
      'workflow',
      'ralph',
      'memory',
      'subagent',
      'list_subagent_models',
      'interrupt_agent',
      'terminal_open',
      'terminal_send',
      'terminal_read',
      'terminal_signal',
      'terminal_list',
      'terminal_close',
    ].map((name) => toolDisplayName(name, NO_PLUGIN));

    expect(titles).toStrictEqual([
      'Check the goal',
      'Set a goal',
      'Update the goal',
      'Run a workflow',
      'Run a ralph loop',
      'Use memory',
      'Start an agent',
      'List agent models',
      'Interrupt an agent',
      'Open a terminal',
      'Type in a terminal',
      'Read a terminal',
      'Signal a terminal',
      'List terminals',
      'Close a terminal',
    ]);
  });

  it('keeps the title a tool shows today', () => {
    expect(toolDisplayName('send_message', NO_PLUGIN)).toBe('Send message');
    expect(toolDisplayName('image_gen', NO_PLUGIN)).toBe('Generate or edit images');
    expect(toolDisplayName('custom_thing', NO_PLUGIN)).toBe('Custom thing');
  });

  it('names a plugin tool after its plugin', () => {
    expect(toolDisplayName('abc__read_note', () => 'Notes')).toBe('Notes: read note');
  });
});
