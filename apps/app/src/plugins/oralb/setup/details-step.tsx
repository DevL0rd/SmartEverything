import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { SelectRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import type { RoomOption } from '../../toothbrush/setup/details-step';
import { StaticBrush } from '../../toothbrush/setup/static-brush';
import { privacyLine } from './privacy-line';

const NOBODY = '';

export interface PersonOption {
  readonly value: string;
  readonly label: string;
}

function Preview({
  name,
  model,
  room,
  ring,
}: {
  readonly name: string;
  readonly model: string;
  readonly room: string;
  readonly ring: string | null;
}): ReactNode {
  const line = [model, room].filter((part) => part !== '').join(' · ');
  return (
    <View className="flex-row items-center gap-4">
      <StaticBrush brand="oralb" px={96} ring={ring} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong" numberOfLines={1}>
          {name === '' ? 'Oral-B iO' : name}
        </Text>
        <Text variant="callout" tone="variant" numberOfLines={1}>
          {line}
        </Text>
      </View>
    </View>
  );
}

export interface DetailsProps {
  readonly name: string;
  readonly room: string;
  readonly rooms: readonly RoomOption[];
  readonly model: string;
  readonly person: string;
  readonly people: readonly PersonOption[];
  readonly ring: string | null;
  readonly problem: string | null;
  readonly onName: (name: string) => void;
  readonly onRoom: (room: string) => void;
  readonly onModel: (model: string) => void;
  readonly onPerson: (person: string) => void;
}

export function OralbDetailsStep(props: DetailsProps): ReactNode {
  const { people, person, rooms, room } = props;
  const chosen = people.find((option) => option.value === person)?.label ?? null;
  return (
    <View className="gap-4">
      <Preview name={props.name} model={props.model} room={room} ring={props.ring} />
      <TextField label="Name" value={props.name} onChange={props.onName} />
      <TextField
        label="Model"
        value={props.model}
        onChange={props.onModel}
        helper="As printed on the handle or the box. It only changes the name shown in the app."
      />
      <List inset>
        {people.length === 0 ? null : (
          <SelectRow
            icon="user"
            title="Who uses this toothbrush"
            options={[{ value: NOBODY, label: 'Nobody yet' }, ...people]}
            value={person}
            onChange={props.onPerson}
          />
        )}
        <SelectRow
          icon="door"
          title="Room"
          options={[{ value: '', label: 'No room' }, ...rooms]}
          value={room}
          onChange={props.onRoom}
        />
      </List>
      <Text variant="footnote" tone="faint">
        {privacyLine(chosen)}
      </Text>
      {props.problem === null ? null : (
        <Banner
          tone="critical"
          title="Could not add the toothbrush"
          body={props.problem}
          wrapBody
        />
      )}
    </View>
  );
}
