import { describe, expect, it } from 'vitest';
import * as effects from '../../../src/automations/effects';

describe('effect modules', () => {
  it('load together and export every adapter once', () => {
    expect(Object.keys(effects).sort()).toStrictEqual([
      'CommandMetadataLog',
      'ComputerEffects',
      'DeviceEnsurer',
      'DeviceFader',
      'DeviceRestorer',
      'DeviceSetter',
      'DeviceToggler',
      'EffectBudget',
      'EffectBudgetExceededError',
      'EnsureNotConfirmedError',
      'HttpEffectError',
      'HttpEffects',
      'Notifier',
      'TemporaryDeviceChanges',
      'ToolActionError',
      'applyValueChange',
      'callTool',
      'commandMetadata',
      'effectMembers',
      'fadeLevels',
      'metadataOf',
      'reportedWithin',
      'runDeviceOperation',
      'runViewer',
      'sendIrButton',
      'stampOf',
      'wakeAssistant',
    ]);
  });
});
