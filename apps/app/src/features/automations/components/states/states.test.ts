import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({
  View: stub('View'),
  ActivityIndicator: stub('ActivityIndicator'),
}));
vi.mock('react-native-svg', () => ({
  default: stub('Svg'),
  Circle: stub('Circle'),
  G: stub('G'),
  Line: stub('Line'),
  Rect: stub('Rect'),
}));
vi.mock('../../../../design/colour', () => ({ useColour: (): string => '#000' }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/card', () => ({ Card: stub('Card') }));
vi.mock('../../../../components/banner', () => ({ Banner: stub('Banner') }));
vi.mock('../../../../components/empty-state', () => ({ EmptyState: stub('EmptyState') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));

const { STATES_COPY } = await import('./states-copy');
const { EmptyAutomations } = await import('./empty-automations');
const { EmptyRuns } = await import('./empty-runs');
const { EmptyNodes } = await import('./empty-nodes');
const { NewCanvasSlots } = await import('./new-canvas-slots');
const { OfflineBanner } = await import('./offline-banner');
const { MissingKindCard } = await import('./missing-kind-card');
const { RemovedRefChip } = await import('./removed-ref-chip');
const { CanvasReopening } = await import('./canvas-reopening');
const { MemberReadonly, disabledNodeReason } = await import('./member-readonly');

function render(element: ReactNode): readonly { readonly kind: string; readonly props: Props }[] {
  seen.length = 0;
  renderToStaticMarkup(element);
  return [...seen];
}

function firstOf(kind: string): Props {
  const found = seen.find((entry) => entry.kind === kind);
  if (found === undefined) {
    throw new Error(`no ${kind} rendered`);
  }
  return found.props;
}

const noop = (): void => undefined;

describe('automation states', () => {
  it('shows the empty-automations hero with both entry buttons wired', () => {
    const onStart = vi.fn();
    const onAsk = vi.fn();
    render(createElement(EmptyAutomations, { onStart, onAsk }));
    const buttons = seen.filter((entry) => entry.kind === 'Button').map((entry) => entry.props);
    expect(buttons.map((button) => button['label'])).toEqual([
      'Start from scratch',
      'Ask the assistant',
    ]);
    expect(buttons[0]?.['onPress']).toBe(onStart);
    expect(buttons[1]?.['onPress']).toBe(onAsk);
    expect(seen.some((entry) => entry.kind === 'Svg')).toBe(true);
  });

  it('renders the template slot only when templates are given', () => {
    render(createElement(EmptyAutomations, { onStart: noop, onAsk: noop }));
    expect(seen.some((entry) => entry.props.children === 'Start from an idea')).toBe(false);
    render(
      createElement(EmptyAutomations, {
        onStart: noop,
        onAsk: noop,
        templates: createElement('i'),
      }),
    );
    expect(seen.some((entry) => entry.props.children === 'Start from an idea')).toBe(true);
  });

  it('offers Test in the empty runs state only when a test can start', () => {
    render(createElement(EmptyRuns, {}));
    expect(firstOf('EmptyState')['action']).toBeUndefined();
    expect(firstOf('EmptyState')['body']).toBe('Use Test to try it safely.');
    render(createElement(EmptyRuns, { onTest: noop }));
    expect(firstOf('EmptyState')['action']).toBeDefined();
  });

  it('shows the reusable-node hint with an optional create button', () => {
    render(createElement(EmptyNodes, {}));
    expect(seen.some((entry) => entry.kind === 'Button')).toBe(false);
    render(createElement(EmptyNodes, { onCreate: noop }));
    expect(firstOf('Button')['label']).toBe('New Custom Node');
    expect(seen.some((entry) => entry.props.children === STATES_COPY.emptyNodes.body)).toBe(true);
  });

  it('lets each canvas slot open the palette', () => {
    const onAddTrigger = vi.fn();
    const onAddStep = vi.fn();
    render(createElement(NewCanvasSlots, { onAddTrigger, onAddStep }));
    const slots = seen.filter((entry) => entry.kind === 'Interactive').map((entry) => entry.props);
    expect(slots.map((slot) => slot['onPress'])).toEqual([onAddTrigger, onAddStep]);
    expect(slots[0]?.['label']).toBe('Add a trigger. What starts it?');
  });

  it('says whether a change is unsaved while the hub is unreachable', () => {
    render(createElement(OfflineBanner, { unsavedChanges: true }));
    expect(firstOf('Banner')['title']).toBe('Can’t reach the Home Hub');
    expect(String(firstOf('Banner')['body'])).toContain('Your last change is not saved');
    render(createElement(OfflineBanner, { unsavedChanges: false }));
    expect(String(firstOf('Banner')['body'])).not.toContain('not saved');
    expect(firstOf('Banner')['action']).toBeUndefined();
  });

  it('names the missing kind and wires Replace and Delete', () => {
    const onReplace = vi.fn();
    const onDelete = vi.fn();
    render(createElement(MissingKindCard, { kindName: 'Printer job', onReplace, onDelete }));
    expect(firstOf('Card')['title']).toBe('Missing node: Printer job');
    expect(firstOf('Card')['tone']).toBe('critical');
    const buttons = seen.filter((entry) => entry.kind === 'Button').map((entry) => entry.props);
    expect(buttons.map((button) => button['onPress'])).toEqual([onReplace, onDelete]);
  });

  it('marks a removed reference in its accessible label', () => {
    render(createElement(RemovedRefChip, { name: 'Kitchen lamp' }));
    const labelled = seen.find((entry) => entry.kind === 'View')?.props;
    expect(labelled?.['accessibilityLabel']).toBe('Kitchen lamp (removed)');
  });

  it('announces the canvas reopening', () => {
    render(createElement(CanvasReopening, {}));
    expect(firstOf('View')['accessibilityRole']).toBe('alert');
    expect(seen.some((entry) => entry.props.children === 'The canvas closed. Reopening…')).toBe(
      true,
    );
  });

  it('tells members who made a read-only automation', () => {
    render(createElement(MemberReadonly, { author: 'Felix' }));
    expect(firstOf('Banner')['title']).toBe('Made by Felix. Ask the owner to change it.');
    render(createElement(MemberReadonly, { author: null }));
    expect(firstOf('Banner')['title']).toBe('Made by someone else. Ask the owner to change it.');
    expect(disabledNodeReason('Only the owner can use it.')).toBe(
      'Unavailable. Only the owner can use it.',
    );
  });
});
