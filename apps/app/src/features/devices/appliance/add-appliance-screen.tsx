import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { IrAppliance, IrLibraryModel } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { createIrApplianceFromLibrary } from '../../../api/ir-appliances';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Select, type SelectOption } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { useDevice, useDevices, useRooms } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { MissingDevice } from '../detail/missing-device';
import { DeviceSettingsFrame } from '../device-settings/settings-frame';
import { useDisplayName } from '../model/display-name';
import {
  EMPTY_PATH,
  categoryIcon,
  defaultName,
  modelTitle,
  nameProblem,
  opensAfterCreate,
  type LibraryPath,
} from './add-appliance-model';
import { blasterChoices } from './appliance-model';
import { BrandStep, CategoryStep, ModelStep } from './library-steps';

const log = new Logger('app.devices');

const BLASTER_ROOM = 'blaster-room';

const APPLIANCE_MODEL = 'IR appliance';

const CHANGE = (
  <Text variant="callout" tone="primary">
    Change
  </Text>
);

function Picked({
  path,
  onChange,
}: {
  readonly path: LibraryPath;
  readonly onChange: (path: LibraryPath) => void;
}): ReactNode {
  if (path.category === null) {
    return null;
  }
  return (
    <List title="Chosen">
      <ListRow
        title={path.category}
        subtitle="Type"
        icon={categoryIcon(path.category)}
        trailing={CHANGE}
        onPress={() => {
          onChange(EMPTY_PATH);
        }}
      />
      {path.brand === null ? null : (
        <ListRow
          title={path.brand}
          subtitle="Brand"
          icon="star"
          trailing={CHANGE}
          onPress={() => {
            onChange({ ...path, brand: null, model: null });
          }}
        />
      )}
      {path.model === null ? null : (
        <ListRow
          title={modelTitle(path.model)}
          subtitle="Model"
          icon="remote"
          trailing={CHANGE}
          wrapSubtitle
          onPress={() => {
            onChange({ ...path, model: null });
          }}
        />
      )}
    </List>
  );
}

function BlasterList({
  blasters,
  value,
  onPick,
}: {
  readonly blasters: readonly Device[];
  readonly value: string;
  readonly onPick: (blasterId: string) => void;
}): ReactNode {
  return (
    <List
      title="Sends through"
      footer="The IR blaster that can see the appliance. Codes are sent through this blaster; an offline one cannot send."
    >
      {blasters.map((blaster) => (
        <ListRow
          key={blaster.id}
          title={blaster.label}
          subtitle={blaster.online ? 'Online' : 'Offline'}
          subtitleTone={blaster.online ? 'variant' : 'warning'}
          icon="remote"
          selected={blaster.id === value}
          trailing={
            blaster.id === value ? <Icon name="check" size={20} tone="primary" /> : undefined
          }
          onPress={() => {
            onPick(blaster.id);
          }}
        />
      ))}
    </List>
  );
}

function RoomSelect({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (roomId: string) => void;
}): ReactNode {
  const rooms = useRooms();
  const options: readonly SelectOption<string>[] = [
    { value: BLASTER_ROOM, label: 'Same room as the blaster' },
    ...rooms.map((room) => ({ value: room.id, label: room.name })),
  ];
  return <Select label="Room" options={options} value={value} onChange={onChange} searchable />;
}

function useOpenCreated(blasterId: string): (appliance: IrAppliance, name: string) => void {
  const router = useRouter();
  return (appliance, name) => {
    if (appliance.device_id !== null && opensAfterCreate(appliance.category)) {
      router.replace(
        href.device({ id: appliance.device_id, kind: 'air_conditioner', model: APPLIANCE_MODEL }),
      );
      return;
    }
    if (appliance.device_id === null) {
      log.warn('appliance.created_without_device', { applianceId: appliance.id });
    }
    notify({ message: `${name} is in Devices now`, tone: 'default' });
    router.replace(href.settings.device(blasterId, 'remotes'));
  };
}

interface Draft {
  readonly name: string;
  readonly blasterId: string;
  readonly roomId: string;
}

function useCreate(
  blaster: Device,
  model: IrLibraryModel,
  draft: Draft,
): { readonly busy: boolean; readonly problem: string | null; readonly create: () => void } {
  const mutation = useMutationState();
  const opened = useOpenCreated(blaster.id);
  const create = (): void => {
    if (nameProblem(draft.name) !== null) {
      return;
    }
    const name = draft.name.trim();
    mutation.run(
      () =>
        createIrApplianceFromLibrary({
          libraryId: model.id,
          blasterId: draft.blasterId,
          name,
          roomId: draft.roomId === BLASTER_ROOM ? null : draft.roomId,
        }),
      {
        failure: `${name} was not added`,
        inline: true,
        onDone: (appliance) => {
          opened(appliance, name);
        },
      },
    );
  };
  return { busy: mutation.busy, problem: mutation.problem, create };
}

function CreateButton({
  busy,
  problem,
  disabled,
  onPress,
}: {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <>
      {problem === null ? null : <Banner tone="critical" title={problem} />}
      <Button
        label="Add appliance"
        icon="plus"
        loading={busy}
        disabled={disabled}
        onPress={onPress}
      />
    </>
  );
}

function DetailsStep({
  blaster,
  model,
}: {
  readonly blaster: Device;
  readonly model: IrLibraryModel;
}): ReactNode {
  const [draft, setDraft] = useState<Draft>({
    name: defaultName(model.brand, model.category),
    blasterId: blaster.id,
    roomId: BLASTER_ROOM,
  });
  const [touched, setTouched] = useState(false);
  const blasters = blasterChoices(useDevices(), null);
  const { busy, problem, create } = useCreate(blaster, model, draft);
  const named = nameProblem(draft.name);
  return (
    <View className="gap-6">
      <TextField
        label="Name"
        placeholder="Appliance name"
        value={draft.name}
        onChange={(name) => {
          setTouched(true);
          setDraft({ ...draft, name });
        }}
        onSubmit={create}
        error={touched ? named : null}
      />
      <RoomSelect
        value={draft.roomId}
        onChange={(roomId) => {
          setDraft({ ...draft, roomId });
        }}
      />
      <BlasterList
        blasters={blasters}
        value={draft.blasterId}
        onPick={(blasterId) => {
          setDraft({ ...draft, blasterId });
        }}
      />
      <CreateButton busy={busy} problem={problem} disabled={named !== null} onPress={create} />
    </View>
  );
}

function Step({
  blaster,
  path,
  onChange,
}: {
  readonly blaster: Device;
  readonly path: LibraryPath;
  readonly onChange: (path: LibraryPath) => void;
}): ReactNode {
  if (path.category === null) {
    return (
      <CategoryStep
        onPick={(category) => {
          onChange({ ...EMPTY_PATH, category });
        }}
      />
    );
  }
  if (path.brand === null) {
    return (
      <BrandStep
        category={path.category}
        onPick={(brand) => {
          onChange({ ...path, brand });
        }}
      />
    );
  }
  if (path.model === null) {
    return (
      <ModelStep
        category={path.category}
        brand={path.brand}
        onPick={(model) => {
          onChange({ ...path, model });
        }}
      />
    );
  }
  return <DetailsStep key={path.model.id} blaster={blaster} model={path.model} />;
}

function Body({ blaster }: { readonly blaster: Device }): ReactNode {
  const name = useDisplayName(blaster.id);
  const [path, setPath] = useState<LibraryPath>(EMPTY_PATH);
  return (
    <DeviceSettingsFrame deviceId={blaster.id} name={name} title="Add an appliance">
      <Picked path={path} onChange={setPath} />
      <Step blaster={blaster} path={path} onChange={setPath} />
    </DeviceSettingsFrame>
  );
}

export function AddApplianceScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return device === null ? <MissingDevice /> : <Body blaster={device} />;
}
