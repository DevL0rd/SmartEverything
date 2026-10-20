import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { TilingChangeInput, TilingState } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Section, SectionAction } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import { DemandRegion } from '../../../store/demand-region';
import { StateMissing } from '../components/state-missing';
import { useComputerDetail } from '../data/computer-metrics';
import { useStateSeed } from '../data/computer-state';
import { useTilingChange, useTilingState } from '../data/computer-tiling';
import {
  TILING_CENTER,
  TILING_CYCLE_WIDTH,
  TILING_OVERVIEW,
  focusWindowChange,
  tilingScreens,
  type TilingColumnView,
  type TilingWindowView,
  type TilingWorkspaceView,
} from './tiling-model';

const TOPICS = ['tiling'] as const;

type Send = (change: TilingChangeInput) => void;

export function TilingSection({
  deviceId,
  online,
}: {
  readonly deviceId: string;
  readonly online: boolean;
}): ReactNode {
  const features = useComputerDetail(deviceId, online).data?.features;
  if (features?.includes('tiling') !== true) return null;
  return (
    <DemandRegion deviceId={deviceId} topics={TOPICS}>
      <TilingLayout deviceId={deviceId} online={online} />
    </DemandRegion>
  );
}

function TilingLayout({
  deviceId,
  online,
}: {
  readonly deviceId: string;
  readonly online: boolean;
}): ReactNode {
  const state = useTilingState(deviceId);
  const load = useStateSeed(deviceId, 'tiling', online);
  const change = useTilingChange(deviceId);
  if (state === undefined) {
    return <StateMissing load={load} offline={!online} loading={<Skeleton shape="block" />} />;
  }
  const send: Send = (next) => {
    change.mutate(next);
  };
  return (
    <Section
      title="Tiling"
      caption={plural(state.workspaces.length, 'workspace')}
      action={
        <SectionAction
          label={state.overviewOpen ? 'Close overview' : 'Open overview'}
          onPress={() => {
            send(TILING_OVERVIEW);
          }}
        />
      }
    >
      {state.workspaces.length === 0 ? (
        <EmptyState
          compact
          icon="grid"
          title="No workspaces yet"
          body="Konveyor lists them here once it has arranged a window."
        />
      ) : (
        <Screens state={state} online={online} send={send} />
      )}
    </Section>
  );
}

function Screens({
  state,
  online,
  send,
}: {
  readonly state: TilingState;
  readonly online: boolean;
  readonly send: Send;
}): ReactNode {
  const screens = tilingScreens(state);
  return screens.map((screen) => (
    <View key={screen.name} className="gap-2">
      {screens.length > 1 ? (
        <Text variant="footnote" tone="variant" className="px-4">
          {screen.name}
        </Text>
      ) : null}
      {screen.workspaces.map((workspace) => (
        <Workspace key={workspace.id} workspace={workspace} online={online} send={send} />
      ))}
    </View>
  ));
}

function Workspace({
  workspace,
  online,
  send,
}: {
  readonly workspace: TilingWorkspaceView;
  readonly online: boolean;
  readonly send: Send;
}): ReactNode {
  const { open } = workspace;
  return (
    <Card
      title={workspace.title}
      icon="layers"
      tone={workspace.urgent ? 'attention' : 'default'}
      label={`${workspace.title}${workspace.shown ? ', shown' : ''}`}
      action={
        workspace.shown ? (
          <Badge label={workspace.focused ? 'In front' : 'Shown'} tone="primary" />
        ) : open === null ? null : (
          <Button
            label="Go here"
            variant="text"
            disabled={!online}
            onPress={() => {
              send(open);
            }}
          />
        )
      }
    >
      {workspace.columns.length === 0 && workspace.floating.length === 0 ? (
        <Text variant="callout" tone="variant">
          Nothing is open here.
        </Text>
      ) : (
        <ColumnStrip workspace={workspace} online={online} send={send} />
      )}
      {workspace.focused ? <ColumnActions online={online} send={send} /> : null}
    </Card>
  );
}

function ColumnStrip({
  workspace,
  online,
  send,
}: {
  readonly workspace: TilingWorkspaceView;
  readonly online: boolean;
  readonly send: Send;
}): ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 py-1"
    >
      {workspace.columns.map((column) => (
        <Column key={column.key} column={column} online={online} send={send} />
      ))}
      {workspace.floating.length === 0 ? null : (
        <View className="w-40 gap-1 rounded-md border border-dashed border-outline-variant p-1">
          <Text variant="caption" tone="variant" className="px-1">
            Floating
          </Text>
          {workspace.floating.map((window) => (
            <WindowPill key={window.id} window={window} online={online} send={send} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Column({
  column,
  online,
  send,
}: {
  readonly column: TilingColumnView;
  readonly online: boolean;
  readonly send: Send;
}): ReactNode {
  return (
    <View className="w-40 gap-1 rounded-md bg-surface-2 p-1">
      {column.tabbed ? (
        <View className="flex-row items-center gap-1 px-1">
          <Icon name="layers" size={16} tone="variant" />
          <Text variant="caption" tone="variant">
            Tabs
          </Text>
        </View>
      ) : null}
      {column.windows.map((window) => (
        <WindowPill key={window.id} window={window} online={online} send={send} />
      ))}
    </View>
  );
}

function WindowPill({
  window,
  online,
  send,
}: {
  readonly window: TilingWindowView;
  readonly online: boolean;
  readonly send: Send;
}): ReactNode {
  return (
    <Interactive
      label={`Bring ${window.label} to the front`}
      selected={window.focused}
      disabled={!online}
      onPress={() => {
        send(focusWindowChange(window));
      }}
      onTone={window.focused ? 'primary' : 'surface'}
      className={cn(
        'min-h-touch-min justify-center rounded-sm px-2 py-1',
        window.focused ? 'bg-primary-container' : 'bg-surface-3',
        window.urgent && 'border border-warning/60',
      )}
    >
      <Text variant="footnote" tone={window.focused ? 'primary' : 'default'} numberOfLines={2}>
        {window.label}
      </Text>
    </Interactive>
  );
}

function ColumnActions({
  online,
  send,
}: {
  readonly online: boolean;
  readonly send: Send;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2 pt-1">
      <Button
        label="Center column"
        variant="tonal"
        icon="maximize"
        disabled={!online}
        onPress={() => {
          send(TILING_CENTER);
        }}
      />
      <Button
        label="Change width"
        variant="tonal"
        icon="resize"
        disabled={!online}
        onPress={() => {
          send(TILING_CYCLE_WIDTH);
        }}
      />
    </View>
  );
}
