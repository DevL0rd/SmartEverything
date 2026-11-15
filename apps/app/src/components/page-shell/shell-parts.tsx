import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { BackOutcome } from '../back-navigation';
import { Breadcrumbs, type Crumb } from '../breadcrumbs';
import { Icon, type IconName } from '../icon';
import { IconButton } from '../icon-button';
import { Text } from '../text';

export type ShellTitleSize = 'bar' | 'desktop';

const MEASURE_WIDTH = { width: 4096 } as const;

export type BackPress = (() => BackOutcome | null) | null;

export function ShellBack({
  back,
  pointer = false,
}: {
  readonly back: BackPress;
  readonly pointer?: boolean;
}): ReactNode {
  if (back === null) return null;
  return (
    <IconButton
      icon="arrowLeft"
      label="Back"
      onPress={back}
      {...(pointer ? { shortcut: 'Alt ←' } : {})}
    />
  );
}

export interface ShellTitleProps {
  readonly title: string;
  readonly size: ShellTitleSize;
  readonly subtitle?: string | undefined;
  readonly breadcrumbs?: readonly Crumb[] | undefined;
  readonly icon?: IconName | null;
  readonly lead?: ReactNode;
  readonly testID?: string;
  readonly onNeed?: (width: number) => void;
}

function CrumbLine({
  breadcrumbs,
  lead,
}: {
  readonly breadcrumbs: readonly Crumb[] | undefined;
  readonly lead: ReactNode;
}): ReactNode {
  if (lead === undefined || lead === null) {
    return breadcrumbs === undefined ? null : <Breadcrumbs crumbs={breadcrumbs} />;
  }
  return (
    <View className="min-w-0 flex-row items-center gap-2">
      {lead}
      {breadcrumbs === undefined ? null : <Breadcrumbs crumbs={breadcrumbs} />}
    </View>
  );
}

function TitleText({ title }: { readonly title: string }): ReactNode {
  return (
    <Text
      variant="title-3"
      accessibilityRole="header"
      numberOfLines={1}
      className="min-w-0 shrink wrap-anywhere"
    >
      {title}
    </Text>
  );
}

function iconOnlyAt(room: number | null, need: number | null): boolean {
  return room !== null && need !== null && need > room;
}

function FittedTitle({
  title,
  icon,
}: {
  readonly title: string;
  readonly icon: IconName;
}): ReactNode {
  const [room, setRoom] = useState<number | null>(null);
  const [need, setNeed] = useState<number | null>(null);
  return (
    <View
      className="min-w-0 flex-row"
      onLayout={(event) => {
        setRoom(event.nativeEvent.layout.width);
      }}
    >
      <View
        pointerEvents="none"
        aria-hidden
        style={MEASURE_WIDTH}
        className="absolute left-0 top-0 flex-row opacity-0"
      >
        <Text
          variant="title-3"
          numberOfLines={1}
          onLayout={(event) => {
            setNeed(event.nativeEvent.layout.width);
          }}
        >
          {title}
        </Text>
      </View>
      {iconOnlyAt(room, need) ? (
        <View testID="shell-title-icon" accessible accessibilityRole="header" aria-label={title}>
          <Icon name={icon} size={24} tone="default" />
        </View>
      ) : (
        <TitleText title={title} />
      )}
    </View>
  );
}

function TitleNeed({
  title,
  subtitle,
  onNeed,
}: {
  readonly title: string;
  readonly subtitle: string | undefined;
  readonly onNeed: (width: number) => void;
}): ReactNode {
  const [titleWidth, setTitleWidth] = useState(0);
  const [subtitleWidth, setSubtitleWidth] = useState(0);
  useEffect(() => {
    onNeed(Math.max(titleWidth, subtitle === undefined ? 0 : subtitleWidth));
  }, [onNeed, titleWidth, subtitleWidth, subtitle]);
  return (
    <View
      pointerEvents="none"
      aria-hidden
      style={MEASURE_WIDTH}
      className="absolute left-0 top-0 items-start opacity-0"
    >
      <Text
        variant="title-3"
        numberOfLines={1}
        onLayout={(event) => {
          setTitleWidth(Math.ceil(event.nativeEvent.layout.width));
        }}
      >
        {title}
      </Text>
      {subtitle === undefined ? null : (
        <Text
          variant="footnote"
          numberOfLines={1}
          onLayout={(event) => {
            setSubtitleWidth(Math.ceil(event.nativeEvent.layout.width));
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

export function ShellTitle(props: ShellTitleProps): ReactNode {
  return (
    <View testID={props.testID} className="min-w-0 gap-0.5 overflow-hidden">
      {props.onNeed === undefined ? null : (
        <TitleNeed title={props.title} subtitle={props.subtitle} onNeed={props.onNeed} />
      )}
      {props.size === 'desktop' ? (
        <CrumbLine breadcrumbs={props.breadcrumbs} lead={props.lead} />
      ) : null}
      {props.icon === undefined || props.icon === null ? (
        <TitleText title={props.title} />
      ) : (
        <FittedTitle title={props.title} icon={props.icon} />
      )}
      {props.subtitle === undefined ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {props.subtitle}
        </Text>
      )}
    </View>
  );
}
