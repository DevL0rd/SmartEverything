import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Grid } from '../../../components/grid';

import {
  BOTTOM_AREA_ID,
  BOTTOM_GRID,
  BOTTOM_PANELS,
  type BottomActivity,
  type BottomOpen,
  type BottomPanel,
} from './bottom-status-model';
import { UsageDetails, type UsageDetailProps } from './chat-detail-widgets';
import { StatusSection } from './status-panel';

const WIDGET_BODY_HEIGHT = 128;

export function ChatBottomArea({
  activity,
  expanded,
  open,
  onPanel,
  columns = 1,
  minItemWidth = BOTTOM_GRID.minItemWidth,
  paneWidth,
  usage,
}: {
  readonly activity: BottomActivity;
  readonly expanded: boolean;
  readonly open: BottomOpen;
  readonly onPanel: (panel: BottomPanel) => void;
  readonly columns?: number;
  readonly minItemWidth?: number;
  readonly paneWidth?: number;
  readonly usage?: UsageDetailProps;
}): ReactNode {
  return (
    <View
      nativeID={BOTTOM_AREA_ID}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!expanded}
      className={expanded ? 'shrink-0 px-gutter pb-1' : 'hidden'}
    >
      {expanded ? (
        <ExpandedGrid
          activity={activity}
          open={open}
          onPanel={onPanel}
          paneWidth={paneWidth}
          columns={columns}
          minItemWidth={minItemWidth}
          usage={usage}
        />
      ) : null}
    </View>
  );
}

function ExpandedGrid({
  activity,
  open,
  onPanel,
  paneWidth,
  columns,
  minItemWidth,
  usage,
}: {
  readonly activity: BottomActivity;
  readonly open: BottomOpen;
  readonly onPanel: (panel: BottomPanel) => void;
  readonly paneWidth: number | undefined;
  readonly columns: number;
  readonly minItemWidth: number;
  readonly usage: UsageDetailProps | undefined;
}): ReactNode {
  const layout = (tiles: ReactNode): ReactNode => (
    <View className="gap-2">
      <ActivityGrid
        activity={activity}
        open={open}
        onPanel={onPanel}
        paneWidth={paneWidth}
        minItemWidth={minItemWidth}
      >
        {columns === BOTTOM_GRID.maxColumns ? tiles : null}
      </ActivityGrid>
      {columns === BOTTOM_GRID.maxColumns || tiles === null ? null : (
        <View className="flex-row items-stretch gap-2">{tiles}</View>
      )}
    </View>
  );
  return usage === undefined ? layout(null) : <UsageDetails usage={usage}>{layout}</UsageDetails>;
}

function ActivityGrid({
  activity,
  open,
  onPanel,
  paneWidth,
  minItemWidth,
  children,
}: {
  readonly activity: BottomActivity;
  readonly open: BottomOpen;
  readonly onPanel: (panel: BottomPanel) => void;
  readonly paneWidth: number | undefined;
  readonly minItemWidth: number;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Grid
      {...BOTTOM_GRID}
      minItemWidth={minItemWidth}
      {...(paneWidth === undefined ? {} : { measuredWidth: paneWidth })}
    >
      {BOTTOM_PANELS.map((panel) => (
        <StatusSection
          key={panel}
          panel={panel}
          label={activity.indicators.find((indicator) => indicator.panel === panel)?.label}
          open={open[panel]}
          activity={activity}
          bodyHeight={WIDGET_BODY_HEIGHT}
          compact={minItemWidth < BOTTOM_GRID.minItemWidth}
          onPress={onPanel}
        />
      ))}
      {children}
    </Grid>
  );
}
