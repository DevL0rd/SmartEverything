import { describe, expect, it } from 'vitest';
import {
  MCP_HUMAN_ONLY_OPERATIONS,
  isAdminOperation,
  isHumanOnlyOperation,
  mcpToolLine,
  mcpToolOperation,
  pluginTurnOperationReason,
} from '../src/mcp/operations';

describe('operations only a person may run', () => {
  it('flags the human-only operations and gives their reason to plugin turns', () => {
    expect(isHumanOnlyOperation('readAssistantVoiceSample')).toBe(true);
    expect(isAdminOperation('readAssistantVoiceSample')).toBe(false);
    expect(pluginTurnOperationReason('readAssistantVoiceSample')).toBe(
      MCP_HUMAN_ONLY_OPERATIONS.readAssistantVoiceSample,
    );
  });

  it('flags the admin operations and gives their reason to plugin turns', () => {
    expect(isAdminOperation('updateAiBudget')).toBe(true);
    expect(isHumanOnlyOperation('updateAiBudget')).toBe(false);
    expect(pluginTurnOperationReason('updateAiBudget')).toBe(
      'Sets what the AI may spend; only a person in the app does that.',
    );
  });

  it('keeps forgetting a water bottle and its history to a person in the app', () => {
    expect(isAdminOperation('forgetBottle')).toBe(true);
    expect(isAdminOperation('removeLocalDevice')).toBe(true);
    expect(pluginTurnOperationReason('forgetBottle')).toContain('only a person in the app');
  });

  it('leaves an ordinary operation open to plugin turns', () => {
    expect(isHumanOnlyOperation('listDeviceEffects')).toBe(false);
    expect(isAdminOperation('listDeviceEffects')).toBe(false);
    expect(pluginTurnOperationReason('listDeviceEffects')).toBeNull();
  });
});

describe('mcpToolOperation', () => {
  it('finds the operation behind an operation tool', () => {
    expect(mcpToolOperation('list_device_effects')).toBe('listDeviceEffects');
  });

  it('finds nothing for an unknown tool', () => {
    expect(mcpToolOperation('no_such_tool')).toBeUndefined();
  });
});

describe('mcpToolLine', () => {
  it('keeps the first sentence without its full stop', () => {
    expect(mcpToolLine('Lists the devices. Also does more.')).toBe('Lists the devices');
  });

  it('keeps a single sentence as it is, minus a final full stop', () => {
    expect(mcpToolLine('Lists the devices.')).toBe('Lists the devices');
    expect(mcpToolLine('Lists the devices')).toBe('Lists the devices');
    expect(mcpToolLine('')).toBe('');
  });
});
