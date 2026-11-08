import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface State {
  watch: unknown;
  view: unknown;
  cls: string;
}

const state = vi.hoisted((): State => ({
  watch: { id: 'watch-1' },
  view: { sports: [], reading: { kind: 'ready', workout: null } },
  cls: 'm',
}));

vi.mock('../../app-shell/hrefs', () => ({
  href: { connect: (): string => '/connect', device: (): string => '/device' },
}));
vi.mock('../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('p', null, children),
}));
vi.mock('../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode =>
    createElement('button', null, label),
}));
vi.mock('../../components/widget-board', () => ({
  WidgetFrame: ({
    children,
    actions,
  }: {
    readonly children: ReactNode;
    readonly actions?: ReactNode;
  }): ReactNode =>
    createElement(
      'article',
      null,
      createElement('main', null, children),
      actions === undefined ? null : createElement('footer', null, actions),
    ),
}));
vi.mock('../../components/widget-board/use-widget-face', () => ({
  useWidgetFace: (): unknown => ({ cls: state.cls }),
}));
vi.mock('./watch-config', () => ({ useWatchCommand: (): unknown => ({ busy: false }) }));
vi.mock('./watch-glance', () => ({ useMyWatch: (): unknown => state.watch }));
vi.mock('./watch-workout', () => ({ useWatchWorkout: (): unknown => state.view }));
vi.mock('./watch-workout-live', () => ({
  WorkoutClock: (): ReactNode => createElement('time', null, 'clock'),
  WorkoutActions: ({ icons }: { readonly icons: boolean }): ReactNode =>
    createElement('button', null, icons ? 'icon controls' : 'labelled controls'),
}));

const { WATCH_WORKOUT_WIDGET } = await import('./watch-workout-widget');

function render(): string {
  return renderToStaticMarkup(
    createElement(() =>
      WATCH_WORKOUT_WIDGET.render({
        size: 'M',
        options: {},
        editing: false,
        frame: { width: 326, height: 140, idiom: 'touch' },
      }),
    ),
  );
}

function footerOf(markup: string): string {
  return /<footer>(.*)<\/footer>/.exec(markup)?.[1] ?? '';
}

const RUNNING = { sport: 'treadmill', state: 'running' };

describe('watch workout widget', () => {
  beforeEach(() => {
    state.watch = { id: 'watch-1' };
    state.cls = 'm';
  });

  it('puts the start button in the action band, not the body', () => {
    state.view = { sports: ['treadmill'], reading: { kind: 'ready', workout: null } };
    const markup = render();
    expect(footerOf(markup)).toContain('Start treadmill');
    expect(markup).not.toMatch(/<main>.*Start treadmill.*<\/main>/);
  });

  it('shows the live clock in the body and the pause and finish controls in the band', () => {
    state.view = { sports: ['treadmill'], reading: { kind: 'ready', workout: RUNNING } };
    const markup = render();
    expect(markup).toMatch(/<main><time>clock<\/time><\/main>/);
    expect(footerOf(markup)).toContain('labelled controls');
  });

  it('keeps the controls as icon buttons in a tile instead of hiding them', () => {
    state.cls = 's';
    state.view = { sports: ['treadmill'], reading: { kind: 'ready', workout: RUNNING } };
    expect(footerOf(render())).toContain('icon controls');
  });

  it('offers a start again once the last workout finished', () => {
    state.view = {
      sports: ['outdoor_running', 'treadmill'],
      reading: { kind: 'ready', workout: { sport: 'treadmill', state: 'finished' } },
    };
    expect(footerOf(render())).toContain('Start outdoor run');
  });

  it('has no band while the watch has not listed its workouts', () => {
    state.view = { sports: [], reading: { kind: 'ready', workout: null } };
    const markup = render();
    expect(markup).not.toContain('<footer>');
    expect(markup).toContain('hasn’t said which workouts');
  });

  it('asks for a watch without a band when none is added', () => {
    state.watch = null;
    const markup = render();
    expect(markup).not.toContain('<footer>');
    expect(markup).toContain('Add your watch');
  });
});
