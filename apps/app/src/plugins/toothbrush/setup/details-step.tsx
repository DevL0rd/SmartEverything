import { MODEL_CHOICES, type BrushGattDump } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { SelectRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextField } from '../../../components/text-field';
import { dumpModel, modelUnknown } from '../model/setup-model';

const MODELS = MODEL_CHOICES.map((choice) => ({ value: choice.key, label: choice.label }));

export interface RoomOption {
  readonly value: string;
  readonly label: string;
}

function ProblemNotice({ problem }: { readonly problem: string | null }): ReactNode {
  return problem === null ? null : (
    <Banner tone="critical" title="Could not add the toothbrush" body={problem} wrapBody />
  );
}

function ModelNotice({ dump }: { readonly dump: BrushGattDump }): ReactNode {
  const reported = dumpModel(dump);
  return (
    <Banner
      tone="info"
      title="Pick your model"
      body={
        reported === null
          ? 'The brush did not report its model. Choose it so the right features are shown.'
          : `The model ${reported} is not in the list. Choose the closest one.`
      }
      wrapBody
    />
  );
}

export function DetailsStep({
  dump,
  name,
  room,
  rooms,
  modelKey,
  problem,
  onName,
  onRoom,
  onModel,
}: {
  readonly dump: BrushGattDump;
  readonly name: string;
  readonly room: string;
  readonly rooms: readonly RoomOption[];
  readonly modelKey: string | null;
  readonly problem: string | null;
  readonly onName: (name: string) => void;
  readonly onRoom: (room: string) => void;
  readonly onModel: (key: string) => void;
}): ReactNode {
  const unknown = modelUnknown(dump);
  return (
    <View className="gap-4">
      {unknown ? <ModelNotice dump={dump} /> : null}
      <TextField label="Name" value={name} onChange={onName} />
      <List inset>
        {unknown ? (
          <SelectRow
            icon="toothbrush"
            title="Toothbrush model"
            options={MODELS}
            value={modelKey}
            placeholder="Choose a model"
            onChange={onModel}
          />
        ) : null}
        <SelectRow
          icon="door"
          title="Room"
          options={[{ value: '', label: 'No room' }, ...rooms]}
          value={room}
          onChange={onRoom}
        />
      </List>
      <ProblemNotice problem={problem} />
    </View>
  );
}
