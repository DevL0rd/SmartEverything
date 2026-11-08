import type { ReactNode } from 'react';
import type { StageInsets } from '../../../../components/house-map/stage-fit';
import { ScrollView, View, type ViewStyle } from 'react-native';
import type { AppHref } from '../../../../components/app-href';
import { background } from '@smarteverything/logging';
import { Button } from '../../../../components/button';
import { ProgressBar } from '../../../../components/charts/progress-bar';
import { Icon } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { Text } from '../../../../components/text';
import { notify } from '../../../../components/toast-store';
import { cn } from '../../../../design/cn';
import { pickFiles } from '../../../../platform/pick-files';
import {
  SCAN_CHIP_FORMATS,
  SCAN_UPLOAD_PROBLEM_TEXT,
  uploadLine,
  uploadShare,
  useScanUpload,
  type ScanUploadState,
  type ScanUploads,
} from '../../data/scan-upload';
import type { StageNotice } from './stage-chrome';

export const SCAN_HELP_PATH: AppHref = '/home-map/scan-help';

export type RealisticScan = 'none' | 'present' | 'missing';

export type RealisticBody =
  'prompt' | 'upload' | 'unsupported' | 'processing' | 'load-failed' | 'scan';

export interface RealisticFacts {
  readonly scan: RealisticScan;
  readonly upload: ScanUploadState;
  readonly webgl2: boolean;
  readonly linked: boolean;
  readonly loadFailed: string | null;
}

export function realisticBody(facts: RealisticFacts): RealisticBody {
  if (facts.upload.kind !== 'idle') return 'upload';
  if (facts.scan === 'none') return 'prompt';
  if (!facts.webgl2) return 'unsupported';
  if (facts.loadFailed !== null) return 'load-failed';
  if (!facts.linked) return 'processing';
  return 'scan';
}

export const REALISTIC_PROCESSING = 'Getting the realistic view ready';

export const REALISTIC_LOAD_FAILED = 'The realistic view couldn’t load';

export const REALISTIC_UNSUPPORTED = 'The realistic view isn’t available on this device';

export function realisticNotices(
  facts: RealisticFacts,
  onUploadAgain: () => void,
): readonly StageNotice[] {
  if (realisticBody(facts) !== 'scan' || facts.scan !== 'missing') return [];
  return [
    {
      icon: 'warning',
      text: 'The realistic view’s file is missing · Upload again',
      onPress: onUploadAgain,
    },
  ];
}

export function realisticTitle(mapName: string): string {
  return `Add a realistic view of ${mapName}`;
}

export function uploadingTitle(name: string): string {
  return `Uploading ${name}`;
}

async function chooseScan(uploads: ScanUploads, mapId: string): Promise<void> {
  try {
    const [file] = await pickFiles('files');
    if (file !== undefined) uploads.start(mapId, file);
  } catch (error) {
    notify({ message: 'The file couldn’t be chosen', error, tone: 'critical' });
  }
}

export function chooseScanFile(uploads: ScanUploads, mapId: string): void {
  background(chooseScan(uploads, mapId), 'home_map.scan_pick_failed');
}

const CARD =
  'w-full max-w-reading items-center gap-3 rounded-lg border-hairline border-outline-variant bg-surface-raised px-5 py-5';

function FormatChips(): ReactNode {
  return (
    <View
      className="flex-row flex-wrap justify-center gap-2"
      accessibilityLabel="Ply, splat or spz"
    >
      {SCAN_CHIP_FORMATS.map((format) => (
        <View
          key={format}
          className="rounded-full border-hairline border-outline-variant bg-surface-2 px-3 py-1"
        >
          <Text variant="label" tone="variant">
            {`.${format}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

export interface RealisticPromptProps {
  readonly mapName: string;
  readonly onChoose: () => void;
  readonly offline: boolean;
}

export function RealisticPrompt({ mapName, onChoose, offline }: RealisticPromptProps): ReactNode {
  return (
    <View className={CARD}>
      <View className="size-14 items-center justify-center rounded-lg bg-primary-container">
        <Icon name="image" size={32} tone="primary" />
      </View>
      <Text variant="title-3" align="center" accessibilityRole="header">
        {realisticTitle(mapName)}
      </Text>
      <Text variant="callout" tone="variant" align="center">
        Upload a gaussian splat scan of this map. You line it up with your rooms once, then it shows
        under the map.
      </Text>
      <FormatChips />
      <View className="flex-row flex-wrap items-center justify-center gap-2 pt-2">
        <Button
          label="Choose a file"
          icon="upload"
          size="lg"
          disabled={offline}
          onPress={onChoose}
        />
        <Button label="How to scan your home" variant="text" href={SCAN_HELP_PATH} />
      </View>
    </View>
  );
}

export interface UploadCardProps {
  readonly state: Exclude<ScanUploadState, { readonly kind: 'idle' }>;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly onChoose: () => void;
  readonly onDismiss: () => void;
}

function Uploading({
  state,
  onCancel,
}: {
  readonly state: Extract<ScanUploadState, { readonly kind: 'uploading' }>;
  readonly onCancel: () => void;
}): ReactNode {
  return (
    <>
      <Text variant="body-strong" align="center" numberOfLines={1}>
        {uploadingTitle(state.name)}
      </Text>
      <ProgressBar
        progress={uploadShare(state.sentBytes, state.totalBytes)}
        colour="primary"
        label="Upload"
      />
      <Text variant="footnote" tone="variant" align="center" accessibilityLiveRegion="polite">
        {uploadLine(state.sentBytes, state.totalBytes)}
      </Text>
      <Button label="Cancel" variant="tonal" onPress={onCancel} />
    </>
  );
}

function Failed({
  state,
  onRetry,
  onChoose,
  onDismiss,
}: Omit<UploadCardProps, 'onCancel' | 'state'> & {
  readonly state: Extract<ScanUploadState, { readonly kind: 'failed' }>;
}): ReactNode {
  return (
    <>
      <View className="w-full flex-row items-center gap-2">
        <Icon name="alert" size={20} tone="critical" />
        <Text variant="body-strong" numberOfLines={1} className="flex-1">
          {state.name}
        </Text>
        <IconButton icon="close" label="Close" onPress={onDismiss} />
      </View>
      <Text variant="callout" tone="critical" align="center" accessibilityLiveRegion="polite">
        {SCAN_UPLOAD_PROBLEM_TEXT[state.problem]}
      </Text>
      {state.detail === null ? null : (
        <Text variant="footnote" tone="variant" align="center">
          {state.detail}
        </Text>
      )}
      {state.problem === 'stopped' ? (
        <Button label="Try again" icon="refresh" onPress={onRetry} />
      ) : (
        <Button label="Choose a file" icon="upload" onPress={onChoose} />
      )}
    </>
  );
}

export function UploadCard(props: UploadCardProps): ReactNode {
  const { state } = props;
  return (
    <View className={CARD}>
      {state.kind === 'uploading' ? (
        <Uploading state={state} onCancel={props.onCancel} />
      ) : (
        <Failed
          state={state}
          onRetry={props.onRetry}
          onChoose={props.onChoose}
          onDismiss={props.onDismiss}
        />
      )}
    </View>
  );
}

export function RealisticUnsupported(): ReactNode {
  return (
    <View className={cn(CARD, 'flex-row justify-center')}>
      <Icon name="info" size={20} tone="variant" />
      <Text variant="callout" tone="variant" className="shrink">
        {REALISTIC_UNSUPPORTED}
      </Text>
    </View>
  );
}

export function RealisticProcessing(): ReactNode {
  return (
    <View className={cn(CARD, 'flex-row justify-center')} accessibilityLiveRegion="polite">
      <Icon name="image" size={20} tone="primary" />
      <Text variant="callout" tone="variant" className="shrink">
        {REALISTIC_PROCESSING}
      </Text>
    </View>
  );
}

export interface RealisticLoadFailedProps {
  readonly detail: string;
  readonly offline: boolean;
  readonly onReload: () => void;
  readonly onChoose: () => void;
}

export function RealisticLoadFailed(props: RealisticLoadFailedProps): ReactNode {
  return (
    <View className={CARD}>
      <View className="flex-row items-center gap-2">
        <Icon name="alert" size={20} tone="critical" />
        <Text variant="callout" tone="critical" accessibilityLiveRegion="polite" className="shrink">
          {REALISTIC_LOAD_FAILED}
        </Text>
      </View>
      <Text variant="footnote" tone="variant" align="center">
        {props.detail}
      </Text>
      <View className="flex-row flex-wrap items-center justify-center gap-2">
        <Button
          label="Try again"
          icon="refresh"
          disabled={props.offline}
          onPress={props.onReload}
        />
        <Button
          label="Upload again"
          icon="upload"
          variant="tonal"
          disabled={props.offline}
          onPress={props.onChoose}
        />
      </View>
    </View>
  );
}

export interface RealisticStateProps {
  readonly uploads: ScanUploads;
  readonly mapId: string;
  readonly mapName: string;
  readonly insets: StageInsets;
  readonly scan: RealisticScan;
  readonly webgl2: boolean;
  readonly linked: boolean;
  readonly loadFailed: string | null;
  readonly offline: boolean;
  readonly onReload: () => void;
}

function betweenBars(insets: StageInsets): ViewStyle {
  return { top: insets.top, bottom: insets.bottom };
}

export function RealisticState(props: RealisticStateProps): ReactNode {
  const { uploads, mapId, loadFailed } = props;
  const upload = useScanUpload(uploads, mapId);
  const body = realisticBody({ ...props, upload });
  const choose = (): void => {
    chooseScanFile(uploads, mapId);
  };
  if (body === 'scan') return null;
  return (
    <View className="absolute inset-0 bg-surface-2/80">
      <ScrollView
        className="absolute inset-x-0"
        style={betweenBars(props.insets)}
        contentContainerClassName="grow items-center justify-center px-gutter py-2"
      >
        {body === 'prompt' ? (
          <RealisticPrompt mapName={props.mapName} onChoose={choose} offline={props.offline} />
        ) : null}
        {body === 'unsupported' ? <RealisticUnsupported /> : null}
        {body === 'processing' ? <RealisticProcessing /> : null}
        {body === 'load-failed' && loadFailed !== null ? (
          <RealisticLoadFailed
            detail={loadFailed}
            offline={props.offline}
            onReload={props.onReload}
            onChoose={choose}
          />
        ) : null}
        {upload.kind === 'idle' ? null : (
          <UploadCard
            state={upload}
            onCancel={() => {
              uploads.cancel(mapId);
            }}
            onRetry={() => {
              uploads.retry(mapId);
            }}
            onChoose={choose}
            onDismiss={() => {
              uploads.dismiss(mapId);
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}
