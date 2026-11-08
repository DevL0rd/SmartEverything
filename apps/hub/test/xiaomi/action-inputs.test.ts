import { readFileSync } from 'node:fs';
import type { CapabilityKey } from '@smarteverything/domain';
import {
  MIOT_SPEC,
  actionParams,
  modelFromSpec,
  type ActionBinding,
  type DeviceModel,
} from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { actionInputs } from '../../src/adapters/xiaomi/action-inputs';

const FIXTURES = new URL('../../../../packages/xiaomi/test/fixtures/', import.meta.url);

function modelOf(file: string): DeviceModel {
  return modelFromSpec(MIOT_SPEC.parse(JSON.parse(readFileSync(new URL(file, FIXTURES), 'utf8'))));
}

function actionOf(
  model: DeviceModel,
  siid: number,
  aiid: number,
): { readonly key: CapabilityKey; readonly binding: ActionBinding } {
  for (const [key, binding] of model.bindings) {
    if (binding.kind === 'action' && binding.siid === siid && binding.aiid === aiid) {
      return { key, binding };
    }
  }
  throw new Error(`no action ${String(siid)}.${String(aiid)}`);
}

describe('action input shape on the wire', () => {
  it('sends piid-tagged inputs for the Xiaomi vacuum, as the robot only acts on those', () => {
    const { key, binding } = actionOf(modelOf('vacuum/pv11gl-spec.json'), 2, 16);
    expect(binding.inputShape).toBe('tagged');
    const inputs = actionInputs(key, binding, { [binding.inputs[0]?.name ?? '']: '[3,4]' });
    expect(inputs).toStrictEqual([{ piid: 15, value: '[3,4]' }]);
    expect(actionParams('42', { siid: 2, aiid: 16 }, inputs)).toStrictEqual({
      did: '42',
      siid: 2,
      aiid: 16,
      in: [{ piid: 15, value: '[3,4]' }],
    });
  });

  it('tags the zone input of the Xiaomi vacuum with piid 12', () => {
    const { key, binding } = actionOf(modelOf('vacuum/pv11gl-spec.json'), 2, 37);
    const zones = '[{"blocks_region":[0,0,1,0,1,1,0,1],"blocks_attr":0}]';
    expect(actionInputs(key, binding, { [binding.inputs[0]?.name ?? '']: zones })).toStrictEqual([
      { piid: 12, value: zones },
    ]);
  });

  it('keeps plain inputs for every other model whose tagged shape is not proven', () => {
    const files = [
      ['zhimi-mb5.json', 4, 1],
      ['chuangmi-ipc019.json', 3, 1],
      ['xiaomi-091ac1.json', 32, 1],
    ] as const;
    for (const [file, siid, aiid] of files) {
      const { binding } = actionOf(modelOf(file), siid, aiid);
      expect(binding.inputShape).toBe('plain');
    }
  });

  it('sends the plain value for a plain model', () => {
    const { key, binding } = actionOf(modelOf('zhimi-mb5.json'), 4, 1);
    const name = binding.inputs[0]?.name ?? '';
    expect(actionInputs(key, binding, { [name]: 2 })).toStrictEqual([2]);
  });
});
