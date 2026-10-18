import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { historyClassOf, type ProcessWindow, type WatchTopic } from '@smarteverything/domain';
import { VisualVisibility, useOnScreen } from '../design/visibility';
import { useRingBackfill } from './computer-backfill';
import type { Device } from './state';
import { useLiveDemand } from './use-live-demand';

function Backfill({
  device,
  topics,
}: {
  readonly device: Device;
  readonly topics: readonly string[] | undefined;
}): ReactNode {
  useRingBackfill(device.id, historyClassOf(device), topics);
  return null;
}

export function DemandRegion({
  deviceId,
  topics,
  window,
  history,
  backfill,
  className = '',
  children,
}: {
  readonly deviceId: string;
  readonly topics: readonly WatchTopic[];
  readonly window?: ProcessWindow;
  readonly history?: Device;
  readonly backfill?: readonly string[];
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  const ref = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(ref);
  useLiveDemand(deviceId, topics, window, visible);
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      pointerEvents="box-none"
      className={className}
    >
      {visible && history !== undefined ? <Backfill device={history} topics={backfill} /> : null}
      <VisualVisibility visible={visible}>{children}</VisualVisibility>
    </View>
  );
}
