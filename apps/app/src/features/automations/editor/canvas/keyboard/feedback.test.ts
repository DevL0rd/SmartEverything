import { createElement } from 'react';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { decisionProgram } from '../../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import { ConnectHint, ConnectToast } from '../connect/connect-overlay';
import { NO_FEEDBACK, withAnnouncement, withFeedback } from '../connect/connect-toast';
import { LiveRegion, problemsMessage } from './live-region';
import { GRAPH_ARIA_LABELS, withNames } from './node-names';
import { buildGraphNodes } from '../scene-to-flow';

describe('live region messages', () => {
  it('announces successes politely and failures assertively', () => {
    const done = withFeedback(NO_FEEDBACK, {
      announcement: 'Then of Turn on now goes to Wait 5 s.',
      toast: null,
      failed: false,
    });
    expect(done.polite?.text).toBe('Then of Turn on now goes to Wait 5 s.');
    expect(done.assertive).toBeNull();
    expect(done.toast).toBeNull();
    const failed = withAnnouncement(done, 'This would make a circle. Use a loop to repeat.', true);
    expect(failed.assertive?.text).toBe('This would make a circle. Use a loop to repeat.');
    expect(failed.polite).toBe(done.polite);
  });

  it('gives every announcement a new sequence number so repeats are read again', () => {
    const once = withAnnouncement(NO_FEEDBACK, 'Disconnected Otherwise of If dark.', false);
    const twice = withAnnouncement(once, 'Disconnected Otherwise of If dark.', false);
    expect(twice.polite?.seq).toBe((once.polite?.seq ?? 0) + 1);
  });

  it('ignores an empty announcement', () => {
    expect(withAnnouncement(NO_FEEDBACK, '', false)).toBe(NO_FEEDBACK);
  });

  it('puts a toast text beside the announcement', () => {
    const shown = withFeedback(NO_FEEDBACK, {
      announcement: 'Replaced: Then now goes to Wait.',
      toast: 'Replaced: Then now goes to Wait.',
      failed: false,
    });
    expect(shown.toast?.text).toBe('Replaced: Then now goes to Wait.');
  });

  it('announces the problem count when it changes and stays quiet otherwise', () => {
    expect(problemsMessage(0, 2)).toBe('2 problems.');
    expect(problemsMessage(2, 1)).toBe('1 problem.');
    expect(problemsMessage(3, 0)).toBe('No problems left.');
    expect(problemsMessage(2, 2)).toBeNull();
  });

  it('renders a polite status region and an assertive alert region', () => {
    const state = withAnnouncement(
      withAnnouncement(NO_FEEDBACK, 'Added Wait after Turn on.', false),
      'Nothing can lead into Start.',
      true,
    );
    const html = renderToStaticMarkup(
      createElement(LiveRegion, { polite: state.polite, assertive: state.assertive }),
    );
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain('role="alert" aria-live="assertive"');
    expect(html).toContain('Added Wait after Turn on.');
    expect(html).toContain('Nothing can lead into Start.');
  });
});

describe('connect overlay', () => {
  it('shows the hint bar only while an output is armed', () => {
    expect(renderToStaticMarkup(createElement(ConnectHint, { armed: null, nodes: [] }))).toBe('');
    const armed = { nodeId: 'n1', handle: 'x:next' };
    const nodes = [
      { id: 'n1', title: 'Start', rows: [{ handle: 'x:next', label: 'Then' }], outputs: [] },
    ];
    expect(renderToStaticMarkup(createElement(ConnectHint, { armed, nodes }))).toContain(
      'Then of Start: tap the step that runs next',
    );
  });

  it('shows a toast without reading it twice', () => {
    const html = renderToStaticMarkup(
      createElement(ConnectToast, { toast: { seq: 1, text: 'Replaced: Then now goes to Wait.' } }),
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('Replaced: Then now goes to Wait.');
    expect(renderToStaticMarkup(createElement(ConnectToast, { toast: null }))).toBe('');
  });
});

describe('card names for screen readers', () => {
  it('gives every card its full name and keeps the key help text', () => {
    const scene = projectGraphScene(decisionProgram(), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    const named = withNames(buildGraphNodes(scene), scene);
    expect(named).toHaveLength(scene.nodes.length);
    for (const node of named) expect(node.ariaLabel?.length ?? 0).toBeGreaterThan(0);
    expect(named.find((node) => node.data.scene.key === 'lamp')?.ariaLabel).toContain('Step');
    expect(GRAPH_ARIA_LABELS['node.a11yDescription.keyboardDisabled']).toContain(
      'Alt and an arrow key',
    );
  });
});
