import type { ReactNode } from 'react';
import type { PersonAccess } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import type { AccessActions } from '../data/access-data';

const FIT = ['fit'] as const;

const HALF_FULL = ['half', 'full'] as const;

export function EditorSheet({
  title,
  intro,
  disabled = false,
  fit = false,
  onSave,
  onClose,
  children,
}: {
  readonly title: string;
  readonly intro: string;
  readonly disabled?: boolean;
  readonly fit?: boolean;
  readonly onSave: () => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      detents={fit ? FIT : HALF_FULL}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button
            label="Save"
            disabled={disabled}
            onPress={() => {
              onClose();
              onSave();
            }}
          />
        </>
      }
    >
      <Text variant="callout" tone="variant">
        {intro}
      </Text>
      {children}
    </Sheet>
  );
}

export interface EditorProps {
  readonly access: PersonAccess;
  readonly actions: AccessActions;
  readonly onClose: () => void;
}
