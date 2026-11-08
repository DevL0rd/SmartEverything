import { MODEL_SPEC, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { TUYA_S06_PRO_MODEL as IR } from '../../src/models/ir';

describe('the Tuya S06 Pro IR blaster model', () => {
  it('parses strictly and uses only known signals', () => {
    expect(MODEL_SPEC.safeParse(IR).success).toBe(true);
    expect(specSignalProblems(IR)).toStrictEqual([]);
  });

  it('carries the live model string as alias and the blaster family', () => {
    expect(IR.meta?.aliases).toStrictEqual(['S06ProWB3S']);
    expect(IR.family).toBe('ir_blaster');
  });

  it('glows the emitter ring and ripples only while sending and stays still otherwise', () => {
    const shot = IR.shots?.[0];
    const send = IR.channels?.find((channel) => channel.id === 'ringSend');

    expect(shot?.focus).toBe('ring');
    expect(shot?.when.anyOf[0]?.allOf[0]).toStrictEqual({
      signal: 'mode',
      op: 'eq',
      value: 'sending',
    });
    expect(send?.motion.type).toBe('pulse');
    expect(IR.anchors?.some((anchor) => anchor.kind === 'effect')).toBe(true);
    expect(IR.states?.['off']).toStrictEqual({ online: false });
  });
});
