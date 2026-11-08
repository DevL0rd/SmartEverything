import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Button } from '../../../../components/button';
import { OverflowButton, type MenuItem } from '../../../../components/menu';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import {
  NO_MAP_ILLUSTRATION_MIN_HEIGHT,
  NoMapHouse,
  noMapLine,
  noMapRobotActions,
  noMapTitle,
  type NoMapRobotFacts,
} from './stage-states';

export interface NoMapCreate {
  readonly create: () => void;
  readonly busy: boolean;
  readonly offline: boolean;
  readonly problem: string | null;
}

export interface NoMapRobot extends NoMapRobotFacts {
  readonly onImport: () => void;
  readonly onQuickMapping: () => void;
}

export interface NoMapStateProps {
  readonly mapName: string | null;
  readonly hasVacuum: boolean;
  readonly create: NoMapCreate;
  readonly robot?: NoMapRobot | undefined;
  readonly menu?: readonly MenuItem[] | undefined;
  readonly className?: string | undefined;
}

function RobotActions({ robot }: { readonly robot: NoMapRobot | undefined }): ReactNode {
  const shown = noMapRobotActions(robot ?? null);
  if (robot === undefined) return null;
  return (
    <>
      {shown.importMap ? (
        <Button
          label="Import from your robot vacuum"
          icon="vacuum"
          variant="tonal"
          onPress={robot.onImport}
        />
      ) : null}
      {shown.quickMapping ? (
        <Button label="Run a quick mapping first" variant="text" onPress={robot.onQuickMapping} />
      ) : null}
    </>
  );
}

function Actions({
  create,
  robot,
}: {
  readonly create: NoMapCreate;
  readonly robot: NoMapRobot | undefined;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-2 pt-2">
      <Button
        label="Create a map"
        icon="pencil"
        size="lg"
        loading={create.busy}
        disabled={create.offline}
        onPress={create.create}
      />
      <RobotActions robot={robot} />
    </View>
  );
}

export function NoMapState({
  mapName,
  hasVacuum,
  create,
  robot,
  menu,
  className,
}: NoMapStateProps): ReactNode {
  const [height, setHeight] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => {
    setHeight(event.nativeEvent.layout.height);
  };
  return (
    <View
      onLayout={onLayout}
      className={cn(
        'w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-outline-variant bg-surface-2 px-5 py-6',
        className,
      )}
    >
      {height >= NO_MAP_ILLUSTRATION_MIN_HEIGHT ? <NoMapHouse /> : null}
      <View className="w-full max-w-reading items-center gap-1">
        <Text variant="title-3" align="center" accessibilityRole="header">
          {noMapTitle(mapName)}
        </Text>
        <Text variant="callout" tone="variant" align="center">
          {noMapLine(hasVacuum)}
        </Text>
        <Actions create={create} robot={robot} />
        {create.problem === null ? null : (
          <Text
            variant="footnote"
            tone={create.offline ? 'variant' : 'critical'}
            align="center"
            accessibilityLiveRegion="polite"
          >
            {create.problem}
          </Text>
        )}
      </View>
      {menu === undefined || menu.length === 0 ? null : (
        <View className="absolute top-2 right-2">
          <OverflowButton items={menu} label="Map options" />
        </View>
      )}
    </View>
  );
}
