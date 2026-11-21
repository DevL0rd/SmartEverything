import type { ReactNode } from 'react';
import { z } from 'zod';
import { DEVICE_TARGET, targetKey } from '@smarteverything/domain';
import { Select } from '../../components/select';
import {
  WidgetEmpty,
  WidgetFrame,
  type BoardClass,
  type BoardWidget,
  type PickerState,
  type TargetRow,
  type WidgetDefinition,
  type WidgetSize,
} from '../../components/widget-board';
import { sameJson } from '../../store/same-json';
import { rowsOf, type StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';
import { lightGroupSections, lightGroupSuggestions, mixedGroupSections } from './group-picker';
import { LightGroup } from './widget/light-group';
import { GroupPreview } from './widget/group-preview';

export const DEVICE_GROUP_TYPE = 'device-group';

const GROUP_OPTIONS = z.strictObject({ target: DEVICE_TARGET });

type GroupOptions = z.infer<typeof GROUP_OPTIONS>;

const SIZES: readonly WidgetSize[] = ['M', 'W', 'XL'];

const EVERY_CLASS: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: SIZES,
  medium: SIZES,
  expanded: SIZES,
};

interface GroupChoice {
  readonly key: string;
  readonly title: string;
  readonly options: TargetRow['options'];
}

function groupChoicesIn(store: StoreState): readonly GroupChoice[] {
  const state: PickerState = {
    devices: rowsOf(store.tables.devices),
    rooms: rowsOf(store.tables.rooms),
    groups: rowsOf(store.tables.device_groups),
  };
  return [...lightGroupSections(state, []), ...mixedGroupSections(state, [])].flatMap((section) =>
    section.rows.map((row) => ({ key: row.key, title: row.title, options: row.options })),
  );
}

function TargetEditor({
  value,
  onChange,
}: {
  readonly value: GroupOptions;
  readonly onChange: (value: GroupOptions) => void;
}): ReactNode {
  const rows = useStoreSelector(groupChoicesIn, sameJson);
  return (
    <Select
      label="Group"
      searchable
      options={rows.map((row) => ({ value: row.key, label: row.title }))}
      value={targetKey(value.target)}
      onChange={(key) => {
        const row = rows.find((candidate) => candidate.key === key);
        if (row !== undefined) onChange(GROUP_OPTIONS.parse(row.options));
      }}
    />
  );
}

function NoTarget(): ReactNode {
  return (
    <WidgetFrame title="Light group" icon="bulbGroup" accent="primary">
      <WidgetEmpty
        icon="bulbGroup"
        colour="warning"
        title="Choose a group"
        body="Pick one in this card’s options."
      />
    </WidgetFrame>
  );
}

function optionsLabel(options: BoardWidget['options']): string {
  const parsed = GROUP_OPTIONS.safeParse(options);
  return parsed.success && parsed.data.target.kind === 'room'
    ? 'Change room lights'
    : 'Change group';
}

export const DEVICE_GROUP_WIDGET: WidgetDefinition = {
  type: DEVICE_GROUP_TYPE,
  title: 'Light group',
  icon: 'bulbGroup',
  group: 'Lights',
  sizes: EVERY_CLASS,
  defaultSize: 'XL',
  instanceOptions: {
    schema: GROUP_OPTIONS,
    editor: ({ value, onChange }) => (
      <TargetEditor value={GROUP_OPTIONS.parse(value)} onChange={onChange} />
    ),
  },
  optionsLabel,
  entries: [
    {
      title: 'Light group',
      subtitle: 'Several lights in one widget, with controls for all',
      icon: 'bulbGroup',
      group: 'Lights',
      defaultSize: 'XL',
      pick: {
        title: 'Choose lights',
        sections: lightGroupSections,
        suggestions: lightGroupSuggestions,
      },
    },
    {
      title: 'Device group',
      subtitle: 'Lights, plugs and fans together, with a power switch for all',
      icon: 'layers',
      group: 'Devices',
      defaultSize: 'XL',
      pick: {
        title: 'Choose a group',
        sections: mixedGroupSections,
      },
    },
  ],
  preview: (frame) => <GroupPreview frame={frame} />,
  render: ({ options, frame }) => {
    const parsed = GROUP_OPTIONS.safeParse(options);
    return parsed.success ? <LightGroup target={parsed.data.target} frame={frame} /> : <NoTarget />;
  },
};
