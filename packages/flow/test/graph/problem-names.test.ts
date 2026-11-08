import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  neverRunsProblem,
  nodeName,
  portLabel,
  unknownTargetProblem,
  wireText,
} from '../../src/graph/problem-types';
import { structureProgram } from '../../src/graph/structure';
import { automation, graphNode, start, stop } from './graph-fixtures';
import { PLUGIN_BRANCHING, PLUGIN_LOOKUP, PLUGIN_STEP } from './plugin-lookup';

describe('names in problem messages', () => {
  const ping = graphNode('ping', PLUGIN_STEP);
  const watch = graphNode('watch', PLUGIN_BRANCHING);

  it('uses the plugin kind name when the lookup knows it and the key when it does not', () => {
    expect(nodeName(ping, PLUGIN_LOOKUP)).toBe('Ping the demo');
    expect(nodeName(ping, STATIC_KIND_LOOKUP)).toBe('ping');
  });

  it('prefers the label and the structural names over any lookup', () => {
    expect(nodeName(graphNode('x', PLUGIN_STEP, { label: 'My ping' }), PLUGIN_LOOKUP)).toBe(
      'My ping',
    );
    expect(nodeName(graphNode('s', 'flow.start'), PLUGIN_LOOKUP)).toBe('Start');
  });

  it('labels the exits of a plugin kind from its declared exits', () => {
    expect(portLabel(watch, 'changed', PLUGIN_LOOKUP)).toBe('Changed');
    expect(portLabel(watch, 'changed', STATIC_KIND_LOOKUP)).toBe('changed');
    expect(wireText(watch, 'changed', PLUGIN_LOOKUP)).toBe('Changed of Watch the demo');
  });

  it('puts the plugin name into the problems built from a node', () => {
    expect(neverRunsProblem(ping, false, PLUGIN_LOOKUP).message).toContain('Ping the demo');
    expect(
      unknownTargetProblem(
        { byKey: new Map(), kinds: STATIC_KIND_LOOKUP },
        watch,
        'changed',
        'gone',
      ).message,
    ).toContain('changed of watch');
  });

  it('keeps the default names in structure results', () => {
    const result = structureProgram(automation([start('missing'), stop('end')]), PLUGIN_LOOKUP);
    expect(result.ok).toBe(false);
  });
});
