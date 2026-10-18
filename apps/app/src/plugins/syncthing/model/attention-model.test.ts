import { describe, expect, it } from 'vitest';
import { attentionTarget } from './attention-model';

const DEVICE = 'AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF-GGGGGGG-HHHHHHH';

describe('attentionTarget', () => {
  it('opens the folder sheet for a folder problem', () => {
    const target = attentionTarget(
      { kind: 'file_errors', text: 'x', folderId: 'photos', deviceId: null },
      'dev1',
    );
    expect(target).toEqual({
      pathname: '/device/[deviceId]/[section]',
      params: { deviceId: 'dev1', section: 'folders', folder: 'photos' },
    });
  });

  it('opens the device sheet for a device problem', () => {
    const target = attentionTarget(
      { kind: 'device_overdue', text: 'x', folderId: null, deviceId: DEVICE },
      'dev1',
    );
    expect(target).toEqual({
      pathname: '/device/[deviceId]/[section]',
      params: { deviceId: 'dev1', section: 'devices', device: DEVICE },
    });
  });

  it('has nowhere to go for a system error', () => {
    expect(
      attentionTarget({ kind: 'system_error', text: 'x', folderId: null, deviceId: null }, 'dev1'),
    ).toBeNull();
  });
});
