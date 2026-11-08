import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMap, HomeMapOp, HomeMapScan } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import type {
  EditEvent,
  EditExtent,
  EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { RenderBounds, RenderFloor } from '../../../../components/house-map/render-scene';
import { selectionTick } from '../../../../platform/haptics';
import { useScanUpload, type ScanUploads } from '../../data/scan-upload';
import { UploadCard, chooseScanFile } from '../../components/stage/realistic-states';
import type { EditCommit, EditorNotice } from '../mount-edit';
import { ScanFields, ScanLevel, ScanOpacity, ScanTwoPoints } from './scan-align-controls';
import {
  EMPTY_POINTS,
  NO_SCAN_TEXT,
  REMOVE_LINE,
  REMOVE_SCAN_OP,
  REMOVE_TITLE,
  SCAN_ALIGN_INTRO,
  SCAN_ALIGN_LABEL,
  placedPatch,
  pointsPrompt,
  pointsTap,
  scanExtentOf,
  scanMarks,
  scanOverlay,
  transformOp,
  type PointsDraft,
} from './scan-align-model';

export type ScanAlignMode = 'drag' | 'points';

export interface ScanAlignInput {
  readonly map: Pick<HomeMap, 'id' | 'scan'>;
  readonly floor: RenderFloor | undefined;
  readonly readOnly: boolean;
  readonly edit: (ops: readonly HomeMapOp[]) => void;
  readonly commit: EditCommit;
  readonly uploads: ScanUploads;
  readonly measured: RenderBounds | null;
}

export interface ScanAlign {
  readonly input: ScanAlignInput;
  readonly scan: HomeMapScan | null;
  readonly extent: EditExtent | null;
  readonly opacity: number | null;
  readonly setOpacity: (opacity: number | null) => void;
  readonly mode: ScanAlignMode;
  readonly setMode: (mode: ScanAlignMode) => void;
  readonly draft: PointsDraft;
  readonly setDraft: (update: (draft: PointsDraft) => PointsDraft) => void;
  readonly removing: boolean;
  readonly setRemoving: (removing: boolean) => void;
  readonly send: (ops: readonly HomeMapOp[]) => void;
}

export function useScanAlign(input: ScanAlignInput): ScanAlign {
  const [opacity, setOpacity] = useState<number | null>(null);
  const [mode, setMode] = useState<ScanAlignMode>('drag');
  const [draft, setDraft] = useState<PointsDraft>(EMPTY_POINTS);
  const [removing, setRemoving] = useState(false);
  return {
    input,
    scan: input.map.scan ?? null,
    extent: scanExtentOf(input.measured, input.floor?.bounds ?? null),
    ...{ opacity, setOpacity, mode, setMode, draft, setDraft, removing, setRemoving },
    send: (ops): void => {
      if (!input.readOnly && ops.length > 0) input.edit(ops);
    },
  };
}

export function scanAlignOverlay(align: ScanAlign): EditOverlay | null {
  const { scan } = align;
  if (scan === null) return null;
  return scanOverlay({
    transform: scan.transform,
    extent: align.extent,
    readOnly: align.input.readOnly,
    picking: align.mode === 'points',
    marks: scanMarks(scan, align.draft, scan.transform),
  });
}

export function scanAlignEdit(align: ScanAlign, event: EditEvent): void {
  const { scan, input } = align;
  if (scan === null) return;
  if (event.type === 'scan') {
    const patch = input.readOnly ? null : placedPatch(scan.transform, event.placement);
    input.commit(event.seq, patch === null ? [] : [transformOp(patch)]);
  } else if (event.type === 'tap' && align.mode === 'points' && !input.readOnly) {
    selectionTick();
    align.setDraft((draft) => pointsTap(draft, scan.transform, event.point));
  }
}

export function scanAlignNotice(align: ScanAlign): EditorNotice | null {
  if (align.scan === null || align.mode !== 'points') return null;
  return { text: pointsPrompt(align.draft), tone: 'info' };
}

function RemoveRow({ align }: { readonly align: ScanAlign }): ReactNode {
  if (!align.removing) {
    return (
      <Button
        label="Remove the realistic view"
        icon="trash"
        variant="destructive"
        disabled={align.input.readOnly}
        onPress={(): void => {
          align.setRemoving(true);
        }}
      />
    );
  }
  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-2 rounded-md border-hairline border-critical bg-surface-2 p-3"
    >
      <Text variant="body-strong">{REMOVE_TITLE}</Text>
      <Text variant="footnote" tone="variant">
        {REMOVE_LINE}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Remove"
          icon="trash"
          variant="destructive"
          grow
          disabled={align.input.readOnly}
          onPress={(): void => {
            align.setRemoving(false);
            align.send([REMOVE_SCAN_OP]);
          }}
        />
        <Button
          label="Keep"
          variant="outlined"
          grow
          onPress={(): void => {
            align.setRemoving(false);
          }}
        />
      </View>
    </View>
  );
}

function UploadRow({
  align,
  uploads,
  hasScan,
}: {
  readonly align: ScanAlign;
  readonly uploads: ScanUploads;
  readonly hasScan: boolean;
}): ReactNode {
  const { map, readOnly } = align.input;
  const upload = useScanUpload(uploads, map.id);
  const choose = (): void => {
    chooseScanFile(uploads, map.id);
  };
  return (
    <View className="gap-2">
      {upload.kind === 'idle' ? (
        <Button
          label={hasScan ? 'Replace the file' : 'Choose a file'}
          icon="upload"
          variant={hasScan ? 'outlined' : 'filled'}
          disabled={readOnly}
          onPress={choose}
        />
      ) : (
        <UploadCard
          state={upload}
          onCancel={(): void => {
            uploads.cancel(map.id);
          }}
          onRetry={(): void => {
            uploads.retry(map.id);
          }}
          onChoose={choose}
          onDismiss={(): void => {
            uploads.dismiss(map.id);
          }}
        />
      )}
    </View>
  );
}

export function ScanAlignPanel({ align }: { readonly align: ScanAlign }): ReactNode {
  const { scan } = align;
  if (scan === null) {
    return (
      <View accessibilityLabel={SCAN_ALIGN_LABEL} className="gap-3">
        <Text variant="footnote" tone="variant">
          {NO_SCAN_TEXT}
        </Text>
        <UploadRow align={align} uploads={align.input.uploads} hasScan={false} />
      </View>
    );
  }
  return (
    <View accessibilityLabel={SCAN_ALIGN_LABEL} className="gap-4">
      <Text variant="footnote" tone="variant">
        {SCAN_ALIGN_INTRO}
      </Text>
      <ScanFields align={align} scan={scan} />
      <ScanOpacity align={align} scan={scan} />
      <ScanLevel align={align} scan={scan} />
      <ScanTwoPoints align={align} scan={scan} />
      <UploadRow align={align} uploads={align.input.uploads} hasScan />
      <RemoveRow align={align} />
    </View>
  );
}
