import { describe, expect, it } from 'vitest';
import { FrameBuilder } from '../../src/node/collectors/frame-builder';
import { CPU, SUMMARY } from './sample-parts';

describe('FrameBuilder', () => {
  it('sends a part the first time, then only when its rounded value changed', () => {
    const builder = new FrameBuilder();
    expect(builder.changed({ summary: SUMMARY, cpu: CPU }, false)).toEqual({
      summary: SUMMARY,
      cpu: CPU,
    });
    expect(builder.changed({ summary: SUMMARY, cpu: CPU }, false)).toEqual({});
    const busier = { ...CPU, load: 50 };
    expect(builder.changed({ summary: SUMMARY, cpu: busier }, false)).toEqual({ cpu: busier });
  });

  it('sends every part again on a key frame', () => {
    const builder = new FrameBuilder();
    builder.changed({ summary: SUMMARY }, false);
    expect(builder.changed({ summary: SUMMARY }, true)).toEqual({ summary: SUMMARY });
  });

  it('sends a part again after it was forgotten', () => {
    const builder = new FrameBuilder();
    builder.changed({ summary: SUMMARY }, false);
    builder.forget('summary');
    expect(builder.changed({ summary: SUMMARY }, false)).toEqual({ summary: SUMMARY });
  });

  it('leaves out parts that were not read', () => {
    expect(new FrameBuilder().changed({}, true)).toEqual({});
  });
});
