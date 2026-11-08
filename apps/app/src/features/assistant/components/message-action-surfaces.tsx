import { useState, type ReactNode } from 'react';
import type { AssistantMessageRow } from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';
import type { ActionId } from '../model/message-actions';
import { readableText } from '@smarteverything/domain/markdown';
import { MessageDetails } from './message-details';
import {
  MessageReactionPicker,
  MessageReactions,
  QuickReactions,
  useMessageReactions,
  type MessageReactionModel,
} from './message-reactions';
import { SelectTextSheet } from './select-text-sheet';

interface SheetFlag {
  readonly open: boolean;
  readonly mounted: boolean;
  readonly show: () => void;
  readonly hide: () => void;
}

function useSheetFlag(): SheetFlag {
  const [state, setState] = useState({ open: false, mounted: false });
  return {
    open: state.open,
    mounted: state.mounted,
    show: (): void => {
      setState({ open: true, mounted: true });
    },
    hide: (): void => {
      setState((current) => ({ ...current, open: false }));
    },
  };
}

interface SurfaceInput {
  readonly row: AssistantMessageRow;
  readonly speakerName: string;
  readonly profileId: string | null;
  readonly enabled: boolean;
  readonly onAsk: (excerpt: string) => void;
}

type Subpages = Partial<Readonly<Record<ActionId, MenuItem['subpage']>>>;

interface MessageActionSurfaces {
  readonly details: () => void;
  readonly select: () => void;
  readonly react: () => void;
  readonly subpages: Subpages;
  readonly host: ReactNode;
  readonly reactionFooter: (align: 'start' | 'end') => ReactNode;
  readonly quickReactions: (close: () => void) => ReactNode;
}

function subpagesOf({ row, onAsk }: SurfaceInput): Subpages {
  return {
    details: ({ back, opener }) => (
      <MessageDetails row={row} open onClose={back} subpage={{ opener }} />
    ),
    select: ({ back, close, opener }) => (
      <SelectTextSheet
        text={readableText(row.text)}
        open
        onClose={back}
        onAsk={onAsk}
        onComplete={close}
        subpage={{ opener }}
      />
    ),
  };
}

function StandaloneDetailsAndText({
  row,
  onAsk,
  details,
  selecting,
}: Pick<SurfaceInput, 'row' | 'onAsk'> & {
  readonly details: SheetFlag;
  readonly selecting: SheetFlag;
}): ReactNode {
  return (
    <>
      {details.mounted ? (
        <MessageDetails row={row} open={details.open} onClose={details.hide} />
      ) : null}
      {selecting.mounted ? (
        <SelectTextSheet
          text={readableText(row.text)}
          open={selecting.open}
          onClose={selecting.hide}
          onAsk={onAsk}
        />
      ) : null}
    </>
  );
}

export function useMessageActionSurfaces(input: SurfaceInput): MessageActionSurfaces {
  const { row, speakerName, profileId, enabled, onAsk } = input;
  const details = useSheetFlag();
  const selecting = useSheetFlag();
  const [picker, setPicker] = useState(false);
  const model: MessageReactionModel = useMessageReactions(row, profileId);
  const react = (): void => {
    setPicker(true);
  };
  return {
    details: details.show,
    select: selecting.show,
    react,
    subpages: subpagesOf(input),
    host: (
      <>
        <StandaloneDetailsAndText row={row} onAsk={onAsk} details={details} selecting={selecting} />
        {picker && enabled ? (
          <MessageReactionPicker
            row={row}
            speakerName={speakerName}
            model={model}
            onClose={() => {
              setPicker(false);
            }}
          />
        ) : null}
      </>
    ),
    reactionFooter: (align): ReactNode =>
      profileId === null || model.members.length === 0 ? null : (
        <MessageReactions key={profileId} model={model} enabled={enabled} align={align} />
      ),
    quickReactions: (close): ReactNode => (
      <QuickReactions model={model} close={close} onMore={react} />
    ),
  };
}
