import { describe, expect, it } from 'vitest';
import { readableLabel, sensorLabel } from '../src/node/readable-label';

describe('readableLabel', () => {
  it.each([
    ['cpu_fan', 'CPU fan'],
    ['gpu_fan', 'GPU fan'],
    ['mid_fan', 'Middle fan'],
    ['pch_cannonlake', 'PCH Cannon Lake'],
    ['acpitz', 'ACPI thermal zone'],
    ['cpuFan', 'CPU fan'],
    ['ssd_temp', 'SSD temperature'],
    ['usb_hub', 'USB hub'],
    ['Fan 1', 'Fan 1'],
    ['Package id 0', 'Package id 0'],
    ['Core 3', 'Core 3'],
    ['Tctl', 'Tctl'],
    ['Composite', 'Composite'],
    ['nvme0n1', 'Nvme0n1'],
    ['', ''],
  ])('says %s as %s', (raw, expected) => {
    expect(readableLabel(raw)).toBe(expected);
  });

  it('never leaves an underscore in a label', () => {
    for (const raw of ['some_unknown_thing', 'x_y', '_leading', 'trailing_']) {
      expect(readableLabel(raw)).not.toContain('_');
    }
  });
});

describe('sensorLabel', () => {
  it('names graphics temperatures by what they measure', () => {
    expect(sensorLabel('amdgpu', 'edge')).toBe('GPU edge');
    expect(sensorLabel('amdgpu', 'junction')).toBe('GPU hotspot');
    expect(sensorLabel('amdgpu', 'mem')).toBe('GPU memory');
  });

  it('treats a graphics reading named like an object property as an ordinary label', () => {
    expect(sensorLabel('amdgpu', 'constructor')).toBe('Constructor');
    expect(sensorLabel('amdgpu', 'toString')).toBe('To string');
  });

  it('keeps the readings a processor, drive or board already names well', () => {
    expect(sensorLabel('coretemp', 'Package id 0')).toBe('Package id 0');
    expect(sensorLabel('coretemp', 'Core 3')).toBe('Core 3');
    expect(sensorLabel('k10temp', 'Tctl')).toBe('Tctl');
    expect(sensorLabel('nvme', 'Composite')).toBe('Composite');
  });

  it('turns a chip that stands in for a missing label into words', () => {
    expect(sensorLabel('pch_cannonlake', 'pch_cannonlake')).toBe('Chipset (Cannon Lake)');
    expect(sensorLabel('acpitz', 'acpitz')).toBe('ACPI thermal zone');
    expect(sensorLabel('nvme', 'nvme')).toBe('NVMe drive');
    expect(sensorLabel('coretemp', 'coretemp')).toBe('CPU');
  });

  it('falls back to the humanized id for a label it cannot map', () => {
    expect(sensorLabel('dell_smm', 'cpu_fan')).toBe('CPU fan');
    expect(sensorLabel('dell_smm', 'mid_fan')).toBe('Middle fan');
  });
});
