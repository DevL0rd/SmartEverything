import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMap, HomeMapActor, HomeMapId } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { List, Section } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { useActiveProfile } from '../../../store/people';
import { saveText, type HomeMapSaveStatus } from '../data/edits';
import { useHomeMapEditing } from '../data/home-map-query';
import { useScanUpload } from '../data/scan-upload';
import { useScanUploads } from '../data/scan-uploads-shared';
import { useHomeMapSetActions, useHomeMapVersions } from '../data/map-set-query';
import { RobotMapFeed } from '../components/robot-map-feed';
import { floorsByLevel } from '../editor/tool-state';
import { emptyFloorOp } from '../model/create-map';
import {
  editorHref,
  newestFirst,
  roomCountLine,
  scanLine,
  scanUploadSubtitle,
  useRun,
  versionTitle,
} from './map-screen-model';

export function Problem({ text }: { readonly text: string | null }): ReactNode {
  if (text === null) return null;
  return (
    <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite" className="px-4">
      {text}
    </Text>
  );
}

const failedSave = (status: HomeMapSaveStatus): string | null =>
  status.kind === 'conflicts' || status.kind === 'not_saved' || status.kind === 'unconfirmed'
    ? saveText(status)
    : null;

function AddFloor({
  map,
  actor,
}: {
  readonly map: HomeMap;
  readonly actor: HomeMapActor;
}): ReactNode {
  const editing = useHomeMapEditing(actor, map.id);
  const { status, connected } = editing.state;
  return (
    <View className="items-start gap-1">
      <Button
        label="Add floor"
        icon="plus"
        variant="text"
        loading={status.kind === 'saving'}
        disabled={!connected}
        onPress={() => {
          background(
            editing.edit([emptyFloorOp(map, randomUUID())]),
            'home_map.settings_add_floor_failed',
          );
        }}
      />
      <Problem text={failedSave(status)} />
    </View>
  );
}

export function Floors({ map }: { readonly map: HomeMap }): ReactNode {
  const profile = useActiveProfile();
  const floors = floorsByLevel(map);
  return (
    <View className="gap-1">
      {floors.length === 0 ? (
        <Section title="Floors">
          <Text variant="footnote" tone="variant" className="px-4">
            No floors yet
          </Text>
        </Section>
      ) : (
        <List title="Floors" inset>
          {floors.map((floor) => (
            <ListRow
              key={floor.id}
              icon="layers"
              title={floor.name}
              subtitle={roomCountLine(floor.rooms.length)}
            />
          ))}
        </List>
      )}
      {profile === null ? null : <AddFloor map={map} actor={`profile:${profile.id}`} />}
    </View>
  );
}

export function SourceRow({ map }: { readonly map: HomeMap }): ReactNode {
  return (
    <List title="Source" inset>
      <RobotMapFeed variant="summary" mapId={map.id} />
    </List>
  );
}

export function RealisticRow({ map }: { readonly map: HomeMap }): ReactNode {
  const { scan } = map;
  const upload = useScanUpload(useScanUploads(), map.id);
  const uploading = scanUploadSubtitle(upload);
  return (
    <List title="Realistic view" inset>
      {scan === undefined ? (
        <ListRow
          icon="image"
          title="Add a realistic view"
          subtitle={uploading ?? 'Upload a .ply, .splat or .spz scan and line it up once'}
          href={editorHref(map.id, 'scan')}
          chevron
        />
      ) : (
        <ListRow
          icon="image"
          title={scanLine(scan)}
          {...(uploading === null ? {} : { subtitle: uploading })}
          trailing={<Button label="Align" variant="tonal" href={editorHref(map.id, 'scan')} />}
        />
      )}
    </List>
  );
}

export function RoomsRows({ mapId }: { readonly mapId: HomeMapId }): ReactNode {
  return (
    <List title="Rooms" inset>
      <ListRow
        icon="split"
        title="Split a room"
        subtitle="Opens the editor with the line tool"
        href={editorHref(mapId, 'rooms')}
        chevron
      />
      <ListRow
        icon="merge"
        title="Merge two rooms"
        subtitle="Opens the editor, then tap the second room"
        href={editorHref(mapId, 'rooms')}
        chevron
      />
    </List>
  );
}

function VersionRows({ mapId }: { readonly mapId: HomeMapId }): ReactNode {
  const versions = useHomeMapVersions(mapId);
  const actions = useHomeMapSetActions();
  const run = useRun();
  const now = useMinute();
  if (versions === null) return <Skeleton shape="tile" className="h-16 w-full" />;
  return (
    <View className="gap-1">
      {versions.length === 0 ? null : (
        <List inset>
          {newestFirst(versions).map((version) => (
            <ListRow
              key={version.versionId}
              icon="history"
              title={versionTitle(version, now)}
              trailing={
                <Button
                  label="Restore"
                  variant="outlined"
                  disabled={run.busy}
                  onPress={() => {
                    run.go(() => actions.restore(mapId, version.versionId));
                  }}
                />
              }
            />
          ))}
        </List>
      )}
      <Problem text={run.problem} />
    </View>
  );
}

export function SavedVersions({ mapId }: { readonly mapId: HomeMapId }): ReactNode {
  const actions = useHomeMapSetActions();
  const run = useRun();
  return (
    <Section
      title="Saved versions"
      footer="Keeps rooms, walls, furniture, devices and paint. Restoring is one edit you can undo."
    >
      <View className="items-start gap-1 px-4">
        <Button
          label="Save this version"
          icon="plus"
          variant="tonal"
          loading={run.busy}
          onPress={() => {
            run.go(() => actions.saveVersion(mapId));
          }}
        />
      </View>
      <Problem text={run.problem} />
      <VersionRows mapId={mapId} />
    </Section>
  );
}
