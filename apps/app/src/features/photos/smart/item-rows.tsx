import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { PhotoFace } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { copyText } from '../../../components/copy-button';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { notThisText, usePeopleActions, type GroupRef } from '../people/actions';
import { FaceAvatar } from '../people/face-avatar';
import { groupTitleOf } from '../people/model';
import { usePhotoFaces } from '../people/queries';
import { usePhotoAnalysis } from './queries';

function Row({
  icon,
  title,
  children,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row gap-3 py-2">
      <Icon name={icon} size={20} tone="variant" />
      <View className="min-w-0 flex-1 gap-1.5">
        <Text variant="footnote" tone="variant">
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}

export function faceRefOf(face: PhotoFace): GroupRef | null {
  if (face.groupId === null) return null;
  return { id: face.groupId, kind: face.kind, name: face.groupName, species: face.species };
}

export function faceLabelOf(face: PhotoFace): string {
  const ref = faceRefOf(face);
  if (ref === null) return face.kind === 'pet' ? 'Pet, not grouped yet' : 'Face, not grouped yet';
  return groupTitleOf(ref);
}

function FaceChip({
  itemId,
  face,
  onOpened,
}: {
  readonly itemId: string;
  readonly face: PhotoFace;
  readonly onOpened: () => void;
}): ReactNode {
  const actions = usePeopleActions();
  const pointer = useIdiom() === 'pointer';
  const ref = faceRefOf(face);
  const label = faceLabelOf(face);
  return (
    <Interactive
      role="button"
      label={label}
      hint={ref === null ? undefined : `Opens ${label}. Long press: ${notThisText(face.kind)}`}
      disabled={ref === null}
      onPress={() => {
        if (ref === null) return;
        onOpened();
        router.push(href.photosPerson(ref.id));
      }}
      onLongPress={() => {
        if (ref !== null) actions.removeFaces(ref, [face.id]);
      }}
      className={cn(
        'max-w-full flex-row items-center gap-2 rounded-full bg-surface-3 pl-1 pr-3',
        pointer ? 'h-10' : 'h-touch-min',
      )}
      layerClassName="rounded-full"
    >
      <FaceAvatar itemId={itemId} box={face.box} kind={face.kind} size={32} />
      <Text
        variant="label"
        numberOfLines={1}
        className="shrink"
        tone={ref?.name === null ? 'variant' : 'default'}
      >
        {label}
      </Text>
    </Interactive>
  );
}

function FacesRow({
  itemId,
  onOpened,
}: {
  readonly itemId: string;
  readonly onOpened: () => void;
}): ReactNode {
  const faces = usePhotoFaces(itemId).data?.faces ?? [];
  if (faces.length === 0) return null;
  return (
    <Row icon="users" title="People and pets">
      <View className="flex-row flex-wrap gap-2">
        {faces.map((face) => (
          <FaceChip key={face.id} itemId={itemId} face={face} onOpened={onOpened} />
        ))}
      </View>
    </Row>
  );
}

function LabelChip({
  label,
  onOpened,
}: {
  readonly label: string;
  readonly onOpened: () => void;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <Interactive
      role="link"
      label={`Search for ${label}`}
      onPress={() => {
        onOpened();
        router.push(href.photos({ q: label }));
      }}
      className={cn(
        'flex-row items-center rounded-full border border-outline-variant px-3',
        pointer ? 'h-8' : 'h-touch-min',
      )}
      layerClassName="rounded-full"
    >
      <Text variant="label" numberOfLines={1}>
        {label}
      </Text>
    </Interactive>
  );
}

function AnalysisRows({
  itemId,
  onOpened,
}: {
  readonly itemId: string;
  readonly onOpened: () => void;
}): ReactNode {
  const analysis = usePhotoAnalysis(itemId).data;
  if (analysis?.state !== 'done') return null;
  const text = analysis.text?.trim() ?? '';
  return (
    <>
      {analysis.caption === null && analysis.labels.length === 0 ? null : (
        <Row icon="sparkles" title="In this photo">
          {analysis.caption === null ? null : <Text variant="callout">{analysis.caption}</Text>}
          {analysis.labels.length === 0 ? null : (
            <View className="flex-row flex-wrap gap-1.5">
              {analysis.labels.map((label) => (
                <LabelChip key={label} label={label} onOpened={onOpened} />
              ))}
            </View>
          )}
        </Row>
      )}
      {text === '' ? null : (
        <Row icon="textCursor" title="Text in this photo">
          <Text variant="callout" selectable>
            {text}
          </Text>
          <View className="flex-row">
            <Button
              label="Copy"
              icon="copy"
              variant="tonal"
              onPress={() => {
                copyText(text, 'Text');
              }}
            />
          </View>
        </Row>
      )}
    </>
  );
}

export function ItemSmartRows({
  itemId,
  onOpened,
}: {
  readonly itemId: string;
  readonly onOpened?: () => void;
}): ReactNode {
  const opened = onOpened ?? ((): void => undefined);
  return (
    <>
      <FacesRow itemId={itemId} onOpened={opened} />
      <AnalysisRows itemId={itemId} onOpened={opened} />
    </>
  );
}
