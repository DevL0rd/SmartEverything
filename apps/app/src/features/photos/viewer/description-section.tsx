import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { MediaInfo, PhotoDescription, PhotoDescriptionSet } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { photoKeys } from '../data/keys';
import { setPhotoDescription } from '../organise/api';
import {
  ADD_DESCRIPTION,
  DESCRIPTION_LABEL,
  FROM_FILE,
  describedMedia,
  descriptionChangeOf,
  savedDescriptionText,
} from './description-model';

function Shown({
  description,
  onEdit,
}: {
  readonly description: PhotoDescription | null;
  readonly onEdit: () => void;
}): ReactNode {
  return (
    <Interactive
      label={description === null ? ADD_DESCRIPTION : `Edit the description: ${description.text}`}
      onPress={onEdit}
      className="min-h-touch-min flex-row items-start gap-3 px-2 py-2.5"
      layerClassName="rounded-md"
    >
      <Icon name="pencil" size={20} tone={description === null ? 'primary' : 'variant'} />
      <View className="min-w-0 flex-1 gap-0.5">
        {description === null ? (
          <Text variant="callout" tone="primary">
            {ADD_DESCRIPTION}
          </Text>
        ) : (
          <>
            <Text variant="body">{description.text}</Text>
            {description.source === 'file' ? (
              <Text variant="footnote" tone="variant">
                {FROM_FILE}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </Interactive>
  );
}

function useSave(
  itemId: string,
  mutation: MutationState,
  onClose: () => void,
): (change: PhotoDescriptionSet) => void {
  const client = useQueryClient();
  return (change) => {
    mutation.run(() => setPhotoDescription(itemId, change), {
      failure: 'The description was not saved',
      label: 'photos.viewer.description',
      onDone: () => {
        client.setQueryData<MediaInfo>(photoKeys.media(itemId), (media) =>
          media === undefined ? media : describedMedia(media, change),
        );
        notify({ message: savedDescriptionText(change) });
        onClose();
      },
    });
  };
}

function Editor({
  itemId,
  description,
  onClose,
}: {
  readonly itemId: string;
  readonly description: PhotoDescription | null;
  readonly onClose: () => void;
}): ReactNode {
  const [draft, setDraft] = useState(description?.text ?? '');
  const mutation = useMutationState();
  const save = useSave(itemId, mutation, onClose);
  const change = descriptionChangeOf(draft, description);
  return (
    <View className="gap-2 py-2">
      <TextField
        label={DESCRIPTION_LABEL}
        showLabel={false}
        value={draft}
        onChange={setDraft}
        placeholder={ADD_DESCRIPTION}
        multiline
        focusOnMount
        disabled={mutation.busy}
      />
      <View className="flex-row flex-wrap items-center justify-end gap-2">
        <Button label="Cancel" variant="text" onPress={onClose} disabled={mutation.busy} />
        <Button
          label="Save"
          variant="tonal"
          loading={mutation.busy}
          disabled={change === null}
          onPress={() => {
            if (change !== null) save(change);
          }}
        />
      </View>
    </View>
  );
}

export function DescriptionSection({
  itemId,
  media,
}: {
  readonly itemId: string;
  readonly media: MediaInfo | null;
}): ReactNode {
  const [editing, setEditing] = useState<string | null>(null);
  if (media === null) return null;
  if (editing === itemId) {
    return (
      <Editor
        itemId={itemId}
        description={media.description}
        onClose={() => {
          setEditing(null);
        }}
      />
    );
  }
  return (
    <View className="-mx-2 pb-1">
      <Shown
        description={media.description}
        onEdit={() => {
          setEditing(itemId);
        }}
      />
    </View>
  );
}
