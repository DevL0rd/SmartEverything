import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { BackOutcome } from '../back-navigation';
import { Breadcrumbs, type Crumb } from '../breadcrumbs';
import { IconButton } from '../icon-button';
import { Interactive } from '../interactive';
import { Text, type TextVariant } from '../text';

export type ShellTitleSize = 'bar' | 'large' | 'desktop';

const TITLE_VARIANT: Readonly<Record<ShellTitleSize, TextVariant>> = {
  bar: 'title-3',
  large: 'large-title',
  desktop: 'title-1',
};

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
  readonly onPress?: (() => void) | undefined;
  readonly lead?: ReactNode;
  readonly testID?: string;
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
    <View className="flex-row items-center gap-2">
      {lead}
      {breadcrumbs === undefined ? null : <Breadcrumbs crumbs={breadcrumbs} />}
    </View>
  );
}

function TitleText({
  title,
  size,
}: {
  readonly title: string;
  readonly size: ShellTitleSize;
}): ReactNode {
  return (
    <Text
      variant={TITLE_VARIANT[size]}
      accessibilityRole="header"
      numberOfLines={size === 'large' ? 2 : 1}
    >
      {title}
    </Text>
  );
}

function PressableTitle({
  title,
  size,
  onPress,
}: {
  readonly title: string;
  readonly size: ShellTitleSize;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`${title}, sections`}
      onPress={onPress}
      className="min-h-touch-min min-w-touch-min flex-row items-center self-start rounded-md"
      layerClassName="rounded-md"
    >
      <TitleText title={title} size={size} />
    </Interactive>
  );
}

export function ShellTitle(props: ShellTitleProps): ReactNode {
  return (
    <View testID={props.testID} className="min-w-0 gap-0.5">
      {props.size === 'desktop' ? (
        <CrumbLine breadcrumbs={props.breadcrumbs} lead={props.lead} />
      ) : null}
      {props.onPress === undefined ? (
        <TitleText title={props.title} size={props.size} />
      ) : (
        <PressableTitle title={props.title} size={props.size} onPress={props.onPress} />
      )}
      {props.subtitle === undefined || props.size === 'bar' ? null : (
        <Text variant="callout" tone="variant" numberOfLines={2}>
          {props.subtitle}
        </Text>
      )}
    </View>
  );
}
