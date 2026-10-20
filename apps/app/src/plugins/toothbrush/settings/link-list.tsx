import type { ReactNode } from 'react';
import { ActionRow, SelectRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { brandUi } from '../brands';
import { useBrushAct, useConfigure } from '../data/brush-act';
import { LINK_LABEL, signalWord } from '../model/brush-model';
import { Anchored } from './anchored';
import type { SettingsProps } from './settings-props';

const POLICIES = [
  { value: 'on_demand', label: 'When the brush wakes' },
  { value: 'armed', label: 'Stay ready all day' },
] as const;

function TakeOver({ deviceId }: { readonly deviceId: string }): ReactNode {
  const { act } = useBrushAct(deviceId);
  return (
    <Anchored deviceId={deviceId} id="take-over" label="Use this phone for the toothbrush link">
      <ActionRow
        icon="refresh"
        title="Use this phone for the toothbrush link"
        subtitle="The brush is handed to this phone"
        onPress={() => {
          act({ action: 'take_over' }, 'This phone could not take over the link', true);
        }}
      />
    </Anchored>
  );
}

function OwnerRows({ deviceId, state, settings }: SettingsProps): ReactNode {
  const configure = useConfigure(deviceId);
  const value = settings.settings;
  const models = brandUi(state.profile.brand).modelChoices;
  if (value === null) {
    return null;
  }
  return (
    <>
      <Anchored deviceId={deviceId} id="policy" label="Connection level">
        <SelectRow
          icon="signal"
          title="Connection level"
          subtitle="Staying ready connects faster but uses a little more battery on the phone"
          wrapSubtitle
          options={POLICIES}
          value={value.policy}
          onChange={(next) => {
            configure({ policy: next });
          }}
        />
      </Anchored>
      {models.length === 0 ? null : (
        <Anchored deviceId={deviceId} id="model" label="Toothbrush model">
          <SelectRow
            icon="toothbrush"
            title="Toothbrush model"
            subtitle="Choose it when the brush does not report its own model"
            wrapSubtitle
            options={models}
            value={value.model}
            placeholder="Detected from the brush"
            onChange={(next) => {
              configure({ model: next });
            }}
          />
        </Anchored>
      )}
    </>
  );
}

export function LinkList(props: SettingsProps): ReactNode {
  const { deviceId, state } = props;
  const { link } = state;
  return (
    <List
      inset
      title="This brush"
      footer="The phone that holds the link carries the brush’s messages to your server."
    >
      <Anchored deviceId={deviceId} id="link" label="Toothbrush link">
        <ValueRow icon="bluetooth" title="Toothbrush link" value={LINK_LABEL[link.phase]} />
      </Anchored>
      <ValueRow
        icon="smartphone"
        title="Held by"
        value={link.holderIsYou ? 'This phone' : (link.holderName ?? 'Nobody yet')}
      />
      <ValueRow icon="signal" title="Signal" value={signalWord(link.rssi)} />
      {link.holderIsYou ? null : <TakeOver deviceId={deviceId} />}
      {state.mayConfigure ? <OwnerRows {...props} /> : null}
    </List>
  );
}
