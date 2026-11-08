import { useRow, useIsOwner } from '../../../store/selectors';
import type { AiChatRow } from '@smarteverything/domain';
import type { Quote } from '../model/composer-state';
import {
  addressOf,
  helperAddressReason,
  type Address,
  type HelperMention,
} from '../model/helper-target';

export interface HelperAddress {
  readonly address: Address;
  readonly target: AiChatRow | null;
  readonly reason: string | null;
}

interface AddressFacts {
  readonly parent: AiChatRow | undefined;
  readonly online: boolean | undefined;
  readonly hasReferences: boolean;
}

export function useHelperAddress(
  facts: AddressFacts,
  mentions: readonly HelperMention[],
  quote: Quote | null,
): HelperAddress {
  const address = addressOf(mentions, quote);
  const target = useRow('ai_chats', address.kind === 'helper' ? address.target.chat_id : null);
  const owner = useIsOwner();
  return { address, target, reason: addressReason({ address, target, owner, facts }) };
}

function addressReason(input: {
  readonly address: Address;
  readonly target: AiChatRow | null;
  readonly owner: boolean;
  readonly facts: AddressFacts;
}): string | null {
  const { address, target, owner, facts } = input;
  if (address.kind === 'ordinary') return null;
  if (address.kind === 'conflict') return 'Choose one helper before sending.';
  const unavailable = helperAddressReason(facts.parent, target, owner);
  if (unavailable !== null) return unavailable;
  if (facts.online !== true) return 'Connect to the hub to send to this helper.';
  return facts.hasReferences ? 'Remove references to send a message to this helper.' : null;
}
