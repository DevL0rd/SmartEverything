import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import {
  MAIN_TOOLS,
  MORE_TOOLS,
  moreSlot,
  toolEnabled,
  type EditorTool,
  type EditorToolInfo,
} from './tool-state';

export const TOOLS_LABEL = 'Map tools';

export const MORE_LABEL = 'More tools';

export interface ToolRowProps {
  readonly tool: EditorTool;
  readonly more: boolean;
  readonly readOnly: boolean;
  readonly onPick: (tool: EditorTool) => void;
  readonly onToggleMore: () => void;
}

function ToolChip({
  icon,
  label,
  selected,
  disabled,
  onPress,
  expanded,
}: {
  readonly icon: EditorToolInfo['icon'];
  readonly label: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly expanded?: boolean;
}): ReactNode {
  return (
    <Interactive
      role="button"
      label={label}
      selected={selected}
      disabled={disabled}
      {...(expanded === undefined ? {} : { expanded })}
      onPress={onPress}
      className={cn(
        'min-h-14 min-w-0 grow basis-14 items-center justify-center gap-1 rounded-md px-1 py-2',
        selected ? 'bg-primary-container' : 'bg-surface-2',
        disabled ? 'opacity-40' : '',
      )}
    >
      <Icon name={icon} size={20} tone={selected ? 'onPrimaryContainer' : 'default'} />
      <Text
        variant="caption"
        numberOfLines={1}
        tone={selected ? 'onPrimaryContainer' : 'variant'}
        className="text-center"
      >
        {label}
      </Text>
    </Interactive>
  );
}

function Tools({
  tools,
  props,
}: {
  readonly tools: readonly EditorToolInfo[];
  readonly props: ToolRowProps;
}): ReactNode {
  return tools.map((tool) => (
    <ToolChip
      key={tool.id}
      icon={tool.icon}
      label={tool.label}
      selected={props.tool === tool.id}
      disabled={!toolEnabled(tool.id, props.readOnly)}
      onPress={(): void => {
        props.onPick(tool.id);
      }}
    />
  ));
}

function MoreSlot(props: ToolRowProps): ReactNode {
  const active = moreSlot(props.tool);
  return (
    <ToolChip
      icon={active?.icon ?? 'ellipsis'}
      label={active?.label ?? 'More'}
      selected={active !== null}
      disabled={false}
      expanded={props.more}
      onPress={props.onToggleMore}
    />
  );
}

export function ToolRow(props: ToolRowProps): ReactNode {
  return (
    <View accessibilityRole="toolbar" accessibilityLabel={TOOLS_LABEL} className="gap-2">
      <View className="flex-row gap-1">
        <Tools tools={MAIN_TOOLS} props={props} />
        <MoreSlot {...props} />
      </View>
      {props.more ? (
        <View accessibilityLabel={MORE_LABEL} className="flex-row flex-wrap gap-1">
          <Tools tools={MORE_TOOLS} props={props} />
        </View>
      ) : null}
    </View>
  );
}
