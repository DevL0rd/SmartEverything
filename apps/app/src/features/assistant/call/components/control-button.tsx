import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { Tooltip } from '../../../../components/tooltip';
import { cn } from '../../../../design/cn';
import type { ControlLook, ControlSpec } from '../model/call-controls';

const FRAME: Readonly<Record<ControlLook, string>> = {
  tonal: 'bg-surface-2',
  selected: 'bg-primary-container',
  end: 'bg-critical',
};

function Glyph({ spec, size }: { readonly spec: ControlSpec; readonly size: 24 | 32 }): ReactNode {
  const tone = spec.look === 'end' ? 'onPrimary' : spec.look === 'selected' ? 'primary' : 'default';
  return <Icon name={spec.icon} size={size} tone={tone} />;
}

function Dot(): ReactNode {
  return <View className="absolute right-2.5 top-2.5 size-2 rounded-full bg-primary" />;
}

export interface ControlProps {
  readonly spec: ControlSpec;
  readonly anchor: RefObject<View | null> | null;
}

export function TouchControl({ spec, anchor }: ControlProps): ReactNode {
  return (
    <View ref={anchor} collapsable={false} className="w-14 items-center gap-1.5">
      <Interactive
        onPress={spec.onPress}
        label={spec.label}
        disabled={spec.disabled}
        selected={spec.look === 'selected'}
        hint={spec.expanded === undefined ? undefined : 'Opens a menu'}
        className={cn('size-14 items-center justify-center rounded-full', FRAME[spec.look])}
        layerClassName="rounded-full"
      >
        <Glyph spec={spec} size={24} />
        {spec.dot === true ? <Dot /> : null}
      </Interactive>
      <Text variant="caption" tone="variant" numberOfLines={1} align="center">
        {spec.text}
      </Text>
    </View>
  );
}

export function PointerControl({ spec, anchor }: ControlProps): ReactNode {
  const [hovered, setHovered] = useState(false);
  return (
    <View
      ref={anchor}
      collapsable={false}
      className="relative"
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <Interactive
        onPress={spec.onPress}
        label={spec.label}
        disabled={spec.disabled}
        selected={spec.look === 'selected'}
        hint={spec.expanded === undefined ? undefined : 'Opens a menu'}
        className={cn(
          'size-12 items-center justify-center rounded-full',
          spec.look === 'tonal' ? 'bg-transparent' : FRAME[spec.look],
        )}
        layerClassName="rounded-full"
      >
        <Glyph spec={spec} size={24} />
        {spec.dot === true ? <Dot /> : null}
      </Interactive>
      {hovered ? (
        <Tooltip
          placement="above"
          text={spec.shortcut === undefined ? spec.text : `${spec.text} · ${spec.shortcut}`}
        />
      ) : null}
    </View>
  );
}
