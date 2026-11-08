import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VacuumFinish } from '@smarteverything/domain';
import { vacuumDevice } from './settings-fixture';

interface Props {
  readonly children?: ReactNode;
  readonly title?: string;
  readonly label?: string;
  readonly selected?: boolean;
  readonly finish?: VacuumFinish;
  readonly onPress?: () => void;
}

interface Hold {
  chosen: VacuumFinish;
  picks: string[];
  readonly presses: Map<string, () => void>;
}

const hold = vi.hoisted<Hold>(() => ({ chosen: 'graphite', picks: [], presses: new Map() }));

function part(name: string): (props: Props) => ReactNode {
  function Part(props: Props): ReactNode {
    return createElement(
      'section',
      { 'data-part': name, 'data-title': props.title },
      props.children,
    );
  }
  return Part;
}

vi.mock('react-native', () => ({ View: part('view') }));
vi.mock('react-native-svg', () => ({ default: part('svg') }));
vi.mock('../../../../components/section', () => ({ List: part('list') }));
vi.mock('../../../../components/text', () => ({ Text: part('text') }));
vi.mock('../../../../design/colour', () => ({ useColour: (): string => '#000000' }));
vi.mock('../../../../components/interactive', () => ({
  Interactive: (props: Props): ReactNode => {
    if (props.label !== undefined && props.onPress !== undefined) {
      hold.presses.set(props.label, props.onPress);
    }
    return createElement(
      'section',
      { 'data-part': 'radio', 'data-label': props.label, 'data-selected': String(props.selected) },
      props.children,
    );
  },
}));
vi.mock('../components/robot-pin', () => ({
  RobotPin: (props: Props): ReactNode =>
    createElement('section', { 'data-part': 'pin', 'data-finish': props.finish }),
}));
vi.mock('../../../device-visuals', () => ({
  useVacuumFinish: (): VacuumFinish => hold.chosen,
  chooseVacuumFinish: (deviceId: string, finish: VacuumFinish): void => {
    hold.picks.push(`${deviceId}:${finish}`);
  },
}));

const { VacuumLookSettings } = await import('./settings-look');

const device = vacuumDevice(true);

function render(): string {
  return renderToStaticMarkup(createElement(VacuumLookSettings, { device }));
}

beforeEach(() => {
  hold.chosen = 'graphite';
  hold.picks = [];
  hold.presses.clear();
});

describe('VacuumLookSettings', () => {
  it('offers graphite, white and black, each drawn as the robot in that finish', () => {
    const html = render();
    expect(html).toContain('data-title="Appearance"');
    const pins = [...html.matchAll(/data-finish="([a-z]+)"/g)].map((match) => match[1]);
    expect(pins).toStrictEqual(['graphite', 'white', 'black']);
  });

  it('marks the stored finish as current', () => {
    hold.chosen = 'black';
    const html = render();
    expect(html).toContain('data-label="Black, current" data-selected="true"');
    expect(html).toContain('data-label="Graphite" data-selected="false"');
  });

  it('stores the picked finish for this robot', () => {
    render();
    hold.presses.get('White')?.();
    expect(hold.picks).toStrictEqual([`${device.id}:white`]);
  });
});
