import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ImageDefaults, ImageEndpoint, ImageModelChoice } from '@smarteverything/domain';
import { updateAssistantSettings } from '../../../../api/assistant';
import { useFocusRequest } from '../../../../components/focus-request';
import { ListRow } from '../../../../components/list-row';
import { Select, type SelectOption } from '../../../../components/select';
import { Text } from '../../../../components/text';
import { notify } from '../../../../components/toast-store';
import { useEntityStore } from '../../../../store/store-context';
import {
  imageOptionFields,
  useImageDefaults,
  withImageDefault,
  type ImageOptionField,
  type ImageOptionKey,
} from '../image/use-image-defaults';
import { sameChoice, useImageCatalog, useSelectedImageModel } from '../image/use-image-models';
import { KeyedRow, PanelHead, PanelSection } from './panel-chrome';

export const IMAGE_SETTINGS_ROW = 'image-settings';

const CORE_KEYS: readonly ImageOptionKey[] = ['aspect_ratio', 'resolution', 'quality'];

const NO_OPTIONS: readonly SelectOption<string>[] = [];

const ignore = (): void => undefined;

export function optionsFor(field: ImageOptionField): readonly SelectOption<string>[] {
  const values =
    field.value === null || field.values.includes(field.value)
      ? field.values
      : [field.value, ...field.values];
  return values.map((value) => ({ value, label: value }));
}

export function imageSettingsSummary(fields: readonly ImageOptionField[]): string | null {
  const shown = fields
    .filter((field) => CORE_KEYS.includes(field.key) && field.supported)
    .flatMap((field) => (field.value === null ? [] : [field.value]));
  return shown.length === 0 ? null : shown.join(' · ');
}

function pairs<T>(items: readonly T[]): readonly (readonly [T, T | null])[] {
  const rows: [T, T | null][] = [];
  for (let index = 0; index < items.length; index += 2) {
    const first = items[index];
    if (first === undefined) continue;
    rows.push([first, items[index + 1] ?? null]);
  }
  return rows;
}

interface ImageSeat {
  readonly choice: ImageModelChoice | null;
  readonly endpoint: ImageEndpoint | null;
}

function useImageSeat(): ImageSeat {
  const choice = useSelectedImageModel();
  const catalog = useImageCatalog();
  const endpoint = catalog.data?.endpoints.find((found) => sameChoice(found, choice)) ?? null;
  return { choice, endpoint };
}

function useDefaultChange(
  choice: ImageModelChoice | null,
): ((key: ImageOptionKey, value: string | null) => void) | null {
  const store = useEntityStore();
  if (choice === null) return null;
  return (key, value): void => {
    const current = store.get().assistant?.settings.image_defaults ?? {};
    updateAssistantSettings({ image_defaults: withImageDefault(current, choice, key, value) })
      .then((status) => {
        store.update((state) => ({ ...state, assistant: status }));
      })
      .catch((error: unknown) => {
        notify({ message: 'The image defaults were not changed', error, tone: 'critical' });
      });
  };
}

function OptionField({
  field,
  onChange,
}: {
  readonly field: ImageOptionField;
  readonly onChange: (key: ImageOptionKey, value: string | null) => void;
}): ReactNode {
  if (!field.supported) {
    return (
      <Select
        label={field.label}
        options={NO_OPTIONS}
        value={null}
        placeholder="Not supported"
        disabled
        onChange={ignore}
      />
    );
  }
  return (
    <Select
      label={field.label}
      options={optionsFor(field)}
      value={field.value}
      onChange={(next): void => {
        onChange(field.key, next);
      }}
    />
  );
}

export function ImageSettingsRow({
  onOpen,
  restoreFocus = false,
}: {
  readonly onOpen: () => void;
  readonly restoreFocus?: boolean;
}): ReactNode {
  const { choice, endpoint } = useImageSeat();
  const defaults = useImageDefaults();
  const ref = useFocusRequest(restoreFocus && choice !== null);
  const summary =
    endpoint === null ? null : imageSettingsSummary(imageOptionFields(endpoint, defaults));
  return (
    <KeyedRow id={IMAGE_SETTINGS_ROW} className="rounded-sm">
      <ListRow
        pressRef={ref}
        compact
        title="Image settings"
        icon="customize"
        {...(choice === null
          ? { subtitle: 'Pick an image model first' }
          : summary === null
            ? {}
            : { subtitle: summary })}
        chevron
        disabled={choice === null}
        onPress={onOpen}
      />
    </KeyedRow>
  );
}

function EmptySeat({
  onBack,
  onClose,
}: {
  readonly onBack: () => void;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <>
      <PanelHead title="Image settings" onBack={onBack} onClose={onClose} />
      <PanelSection title="Defaults">
        <Text variant="footnote" tone="faint">
          Pick an image model first
        </Text>
      </PanelSection>
    </>
  );
}

function SettingsGrid({
  endpoint,
  defaults,
  change,
}: {
  readonly endpoint: ImageEndpoint;
  readonly defaults: ImageDefaults;
  readonly change: (key: ImageOptionKey, value: string | null) => void;
}): ReactNode {
  const fields = imageOptionFields(endpoint, defaults);
  return (
    <View className="gap-2">
      {pairs(fields).map(([first, second]) => (
        <View key={first.key} className="flex-row gap-2">
          <View className="min-w-0 flex-1">
            <OptionField field={first} onChange={change} />
          </View>
          <View className="min-w-0 flex-1">
            {second === null ? null : <OptionField field={second} onChange={change} />}
          </View>
        </View>
      ))}
    </View>
  );
}

export function ImageSettingsPage({
  onBack,
  onClose,
}: {
  readonly onBack: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const { choice, endpoint } = useImageSeat();
  const defaults = useImageDefaults();
  const change = useDefaultChange(choice);
  if (choice === null || endpoint === null || change === null) {
    return <EmptySeat onBack={onBack} onClose={onClose} />;
  }
  return (
    <>
      <PanelHead title="Image settings" onBack={onBack} onClose={onClose} />
      <PanelSection title={`Defaults for ${endpoint.name}`}>
        <SettingsGrid endpoint={endpoint} defaults={defaults} change={change} />
        <Text variant="footnote" tone="variant">
          These defaults apply to every later image. Asking the AI for something different in a
          message overrides them for that image.
        </Text>
      </PanelSection>
    </>
  );
}
