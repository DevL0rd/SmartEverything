import type { ReactNode } from 'react';
import { useState } from 'react';
import { router } from 'expo-router';
import { useContextMenu, type MenuItem } from '../../../components/menu';
import { memberNoun } from '../group-summary';
import { ringColours } from '../master-marks';
import type { GroupData } from './use-group-data';
import { ColourSheet } from './colour-sheet';
import { ColourButton, MasterPower } from './group-header';

export interface GroupControls {
  readonly power: ReactNode;
  readonly colour: ReactNode;
  readonly overlays: ReactNode;
}

function menuItems(data: GroupData): readonly MenuItem[] {
  const { master, target } = data;
  return [
    {
      label: 'Turn all on',
      icon: 'power',
      onPress: (): void => {
        master.setPower(true);
      },
    },
    {
      label: 'Turn all off',
      icon: 'power',
      onPress: (): void => {
        master.setPower(false);
      },
    },
    ...(target.kind === 'devices'
      ? []
      : [
          {
            label: target.kind === 'group' ? 'Open group' : 'Open room',
            icon: 'chevronRight' as const,
            onPress: (): void => {
              router.push(data.href);
            },
          },
        ]),
  ];
}

export function useGroupControls(data: GroupData): GroupControls {
  const [colourOpen, setColourOpen] = useState(false);
  const menu = useContextMenu(menuItems(data), `${data.name} actions`);
  const { state, colours } = data.view;
  return {
    power: (
      <MasterPower
        state={state}
        master={data.master}
        name={data.name}
        lights={data.lights}
        onLongPress={menu.onLongPress}
      />
    ),
    colour: data.lights ? (
      <ColourButton
        state={state}
        colours={ringColours(colours)}
        name={data.name}
        onPress={() => {
          setColourOpen(true);
        }}
      />
    ) : null,
    overlays: (
      <>
        {menu.host}
        {colourOpen ? (
          <ColourSheet
            name={data.name}
            noun={memberNoun(data.lights)}
            state={state}
            master={data.master}
            onClose={() => {
              setColourOpen(false);
            }}
          />
        ) : null}
      </>
    ),
  };
}
