import {
  ORALB_DEFAULT_NAME,
  oralbDefaultModelOf,
  type OralbIdentity,
} from '@smarteverything/domain';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { useActiveProfile } from '../../../store/people';
import { pickedCandidate, type SetupState } from '../../toothbrush/model/setup-model';
import { addOralb, type NewOralb } from '../data/add-oralb';
import { identityOf, type Heard, type IdentityResult } from './dump-reading';

export interface OralbForm {
  readonly name: string;
  readonly room: string;
  readonly model: string;
  readonly defaultModel: string;
  readonly person: string;
  readonly setName: (name: string) => void;
  readonly setRoom: (room: string) => void;
  readonly setModel: (model: string) => void;
  readonly setPerson: (person: string) => void;
  readonly heard: Heard | null;
  readonly identity: IdentityResult | null;
  readonly add: MutationState & { readonly start: () => void };
}

export function heardOf(state: SetupState): Heard | null {
  const address = state.associated ?? state.picked;
  return address === null ? null : { address, advert: pickedCandidate(state)?.advert ?? null };
}

interface Fields {
  readonly name: string;
  readonly room: string;
  readonly model: string;
  readonly defaultModel: string;
  readonly person: string;
}

function request(fields: Fields, identity: OralbIdentity): NewOralb {
  return {
    name: fields.name.trim() === '' ? ORALB_DEFAULT_NAME : fields.name.trim(),
    room: fields.room === '' ? null : fields.room,
    profileId: fields.person === '' ? null : fields.person,
    model: fields.model.trim() === '' ? fields.defaultModel : fields.model.trim(),
    defaultModel: fields.defaultModel,
    identity,
  };
}

export function useOralbForm(state: SetupState): OralbForm {
  const router = useRouter();
  const mutation = useMutationState();
  const active = useActiveProfile();
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [model, setModel] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const heard = heardOf(state);
  const identity = heard === null || state.dump === null ? null : identityOf(heard, state.dump);
  const defaultModel =
    identity?.ok === true ? oralbDefaultModelOf(identity.identity.modelId) : 'iO';
  const fields: Fields = {
    name,
    room,
    model: model ?? defaultModel,
    defaultModel,
    person: person ?? active?.id ?? '',
  };
  const start = (): void => {
    if (identity?.ok === true) {
      const found = identity.identity;
      mutation.run(() => addOralb(request(fields, found)), {
        failure: 'The toothbrush could not be added',
        inline: true,
        onDone: (device) => {
          router.replace(href.device(device));
        },
      });
    }
  };
  return {
    ...fields,
    name: name === '' ? ORALB_DEFAULT_NAME : name,
    setName,
    setRoom,
    setModel,
    setPerson,
    heard,
    identity,
    add: { ...mutation, start },
  };
}
