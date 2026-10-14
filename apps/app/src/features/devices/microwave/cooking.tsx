import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { Sheet } from '../../../components/sheet';
import { ListRow } from '../../../components/list-row';
import { useDeviceValues } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { microwaveReason, microwaveStateLine } from './model';
import { ModeSelect, ProgramFields } from './program-fields';
import { OperatingButtons } from './operating-buttons';
import { useCookingDraft, type CookingDraft } from './use-cooking-draft';

function Notice({
  message,
  critical = false,
}: {
  readonly message: string | null;
  readonly critical?: boolean;
}): ReactNode {
  return message === null ? null : (
    <Text
      variant="footnote"
      tone={critical ? 'critical' : 'variant'}
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  );
}
function SaveProgram({ draft }: { readonly draft: CookingDraft }): ReactNode {
  return (
    <View className="gap-3">
      <Notice message={draft.reason} />
      <Notice message={draft.error} critical />
      <Button
        label={draft.changedMode ? 'Set cooking mode' : 'Save program settings'}
        variant="tonal"
        disabled={draft.disabled}
        loading={draft.busy}
        onPress={() => {
          void draft.save();
        }}
      />
      <Notice message={draft.result} />
    </View>
  );
}
function CookingForm({ device }: { readonly device: Device }): ReactNode {
  const draft = useCookingDraft(device);
  return (
    <View className="gap-4">
      <Text variant="body-strong">{microwaveStateLine(draft.values)}</Text>
      <CookingFields draft={draft} />
      <Notice message={draft.startReason} />
      <OperatingButtons device={device} mode={draft.observedMode} reason={draft.startReason} />
    </View>
  );
}
function CookingFields({ draft }: { readonly draft: CookingDraft }): ReactNode {
  if (draft.mode === undefined || draft.program === null) {
    return (
      <View className="gap-4">
        <ModeSelect config={draft.config} value="" disabled={draft.busy} onChange={draft.select} />
      </View>
    );
  }
  return (
    <View className="gap-4">
      <ModeSelect
        config={draft.config}
        value={draft.program.mode}
        disabled={draft.busy}
        onChange={draft.select}
      />
      <ProgramFields
        program={draft.program}
        mode={draft.mode}
        config={draft.config}
        onChange={draft.change}
        disabled={draft.busy}
      />
      <SaveProgram draft={draft} />
    </View>
  );
}
export function MicrowaveCooking({ device }: { readonly device: Device }): ReactNode {
  return <CookingForm device={device} />;
}
export function MicrowaveProgramRow({ device }: { readonly device: Device }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title="Cooking program"
        subtitle="Mode, duration, power and temperature"
        icon="heater"
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <Sheet
          open
          title="Cooking program"
          detents={['full']}
          onClose={() => {
            setOpen(false);
          }}
        >
          <CookingForm device={device} />
        </Sheet>
      ) : null}
    </>
  );
}
export function MicrowaveQuick({ device }: { readonly device: Device }): ReactNode {
  const [open, setOpen] = useState(false);
  const values = useDeviceValues(device.id);
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant" numberOfLines={2}>
        {microwaveReason(device, values) ?? 'Door closed · Remote control enabled'}
      </Text>
      <Button
        label="Cooking program"
        icon="heater"
        variant="tonal"
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <Sheet
          open
          title="Cooking program"
          detents={['full']}
          onClose={() => {
            setOpen(false);
          }}
        >
          <CookingForm device={device} />
        </Sheet>
      ) : null}
    </View>
  );
}
