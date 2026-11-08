import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  MODEL_OVERRIDE_SCOPES,
  createOverrideIndex,
  type DeviceModels,
  type ModelCatalog,
  type ModelOverrideScope,
  type ModelRef,
} from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { LoadedQuery } from '../../../components/loaded-query';
import { Section } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useDevice, useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { deviceIcon } from '../../device-visuals';
import {
  MODEL_PAGE_TITLE,
  ModelPicker,
  ModelThumb,
  OWNER_ONLY_UPLOAD,
  SCOPE_LABELS,
  SCOPE_SPOKEN,
  UPLOAD_HINT,
  activeScopeOf,
  finishLabel,
  modelSubjectOf,
  pickerRows,
  resolvedModelOf,
  shownFinish,
  sourceText,
  useDeviceModel,
  useModelCatalog,
  visualSourceOf,
} from '../../models';
import { useDisplayName } from '../model/display-name';
import { MissingDevice } from '../detail/missing-device';
import { DeviceSettingsFrame } from './settings-frame';
import { useModelPage, type ModelPage } from './use-model-page';

export const UPLOADED_TITLE = 'Your uploaded model';
export const NO_MODEL_TITLE = 'No model';
export const UPLOAD_LABEL = 'Upload your own model';
export const RESET_LABEL = 'Use the provided model';

const NO_OVERRIDES = createOverrideIndex([]);

const SCOPE_OPTIONS = MODEL_OVERRIDE_SCOPES.map((scope) => ({
  value: scope,
  label: SCOPE_LABELS[scope],
  spoken: SCOPE_SPOKEN[scope],
}));

function useProvidedId(device: Device): string | null {
  const catalog = useModelCatalog();
  return useMemo(() => {
    const { main } = resolvedModelOf(modelSubjectOf(device), catalog, NO_OVERRIDES).resolution;
    return main?.kind === 'catalogue' ? main.modelId : null;
  }, [device, catalog]);
}

function specHashOf(main: ModelRef | null, catalog: ModelCatalog): string | null {
  if (main === null) return null;
  return main.kind === 'asset' ? main.hash : (catalog.find(main.modelId)?.spec_sha256 ?? null);
}

function currentTitle(models: DeviceModels, titleOf: (id: string) => string | null): string {
  if (models.model.asset_hash !== null) return UPLOADED_TITLE;
  return models.model.id === null ? NO_MODEL_TITLE : (titleOf(models.model.id) ?? models.model.id);
}

function Current({
  device,
  models,
  icon,
}: {
  readonly device: Device;
  readonly models: DeviceModels;
  readonly icon: IconName;
}): ReactNode {
  const catalog = useModelCatalog();
  const drawn = useDeviceModel(device);
  const source = visualSourceOf(specHashOf(drawn.main, catalog), drawn.spec, shownFinish(models));
  const title = currentTitle(models, (id) => catalog.find(id)?.title ?? null);
  const overridden = activeScopeOf(models.model.source) !== null;
  return (
    <View className="flex-row items-center gap-4 rounded-lg border-hairline border-outline-variant bg-surface-1 p-4 elevation-1">
      <ModelThumb source={source} icon={icon} size="preview" />
      <View className="min-w-0 flex-1 gap-2">
        <Text variant="title-3" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="footnote" tone="variant">
          {sourceText(models.model.source)}
        </Text>
        <Badge
          label={overridden ? 'Your choice' : 'Provided'}
          tone={overridden ? 'neutral' : 'primary'}
          icon={overridden ? 'brush' : 'check'}
        />
      </View>
    </View>
  );
}

function FinishChip({
  name,
  selected,
  standard,
  disabled,
  onPick,
}: {
  readonly name: string;
  readonly selected: boolean;
  readonly standard: boolean;
  readonly disabled: boolean;
  readonly onPick: (name: string) => void;
}): ReactNode {
  const label = standard ? `${finishLabel(name)} (standard)` : finishLabel(name);
  return (
    <Interactive
      role="radio"
      label={label}
      selected={selected}
      disabled={disabled}
      onPress={(): void => {
        if (!selected) onPick(name);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center rounded-full px-4',
        selected ? 'bg-primary-container' : 'bg-surface-2',
        disabled && 'opacity-60',
      )}
    >
      <Text variant="footnote" tone={selected ? 'onPrimaryContainer' : 'default'}>
        {label}
      </Text>
    </Interactive>
  );
}

function Finishes({
  models,
  page,
}: {
  readonly models: DeviceModels;
  readonly page: ModelPage;
}): ReactNode {
  if (models.finishes.length === 0) return null;
  const shown = shownFinish(models);
  return (
    <Section title="Finish">
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Finish"
        className="flex-row flex-wrap gap-2"
      >
        {models.finishes.map((name) => (
          <FinishChip
            key={name}
            name={name}
            selected={name === shown}
            standard={name === models.default_finish}
            disabled={page.busy}
            onPick={(finish): void => {
              page.pickFinish(models, finish);
            }}
          />
        ))}
      </View>
    </Section>
  );
}

function Actions({
  models,
  page,
}: {
  readonly models: DeviceModels;
  readonly page: ModelPage;
}): ReactNode {
  const owner = useIsOwner();
  const active = activeScopeOf(models.model.source);
  return (
    <Section title="Your own model" footer={owner ? UPLOAD_HINT : OWNER_ONLY_UPLOAD}>
      <View className="flex-row flex-wrap items-center gap-2 px-4">
        {owner ? (
          <Button
            label={UPLOAD_LABEL}
            icon="upload"
            variant="tonal"
            loading={page.busy}
            disabled={page.busy}
            onPress={page.upload}
          />
        ) : null}
        {active === null ? null : (
          <Button
            label={RESET_LABEL}
            icon="reset"
            variant="text"
            disabled={page.busy}
            onPress={(): void => {
              page.reset(active);
            }}
          />
        )}
      </View>
    </Section>
  );
}

function Scope({ page }: { readonly page: ModelPage }): ReactNode {
  return (
    <Section title="Apply a choice to">
      <View className="px-4">
        <Segmented<ModelOverrideScope>
          label="Apply a choice to"
          options={SCOPE_OPTIONS}
          value={page.scope}
          disabled={page.busy}
          fill
          onChange={page.setScope}
        />
      </View>
    </Section>
  );
}

function Loaded({
  device,
  models,
  page,
}: {
  readonly device: Device;
  readonly models: DeviceModels;
  readonly page: ModelPage;
}): ReactNode {
  const catalog = useModelCatalog();
  const icon = deviceIcon(device);
  const rows = pickerRows(models, useProvidedId(device), {
    titleOf: (id) => {
      const row = catalog.find(id);
      return row === undefined ? null : { title: row.title, category: row.category };
    },
  });
  return (
    <View className="gap-section-gap">
      <Current device={device} models={models} icon={icon} />
      {models.issues.length === 0 ? null : (
        <Banner
          tone="warning"
          title="Some models could not be used"
          body={models.issues.join('\n')}
        />
      )}
      <Scope page={page} />
      {rows.length === 0 ? null : (
        <Section title="Models">
          <ModelPicker
            rows={rows}
            finish={shownFinish(models)}
            icon={icon}
            disabled={page.busy}
            onChoose={page.choose}
          />
        </Section>
      )}
      <Finishes models={models} page={page} />
      <Actions models={models} page={page} />
    </View>
  );
}

function Body({ device }: { readonly device: Device }): ReactNode {
  const name = useDisplayName(device.id);
  const page = useModelPage(device.id);
  return (
    <DeviceSettingsFrame deviceId={device.id} name={name} title={MODEL_PAGE_TITLE}>
      <LoadedQuery query={page.query} loading={<Skeleton shape="block" className="h-48" />}>
        {(models) => <Loaded device={device} models={models} page={page} />}
      </LoadedQuery>
    </DeviceSettingsFrame>
  );
}

export function ModelSettingsScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return device === null ? <MissingDevice /> : <Body device={device} />;
}
