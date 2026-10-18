import type { ReactNode } from 'react';
import type { OpenRouterAccount } from '@smarteverything/domain';
import { List } from '../../../components/section';
import { useIsOwner } from '../../../store/selectors';
import { useOpenRouterAccount, useOpenRouterStatus } from '../data/openrouter';
import { MEMBER_FOOTER } from './key-paste-sheet';
import { DefaultModelRow } from './default-model-row';
import { CreditRow, KeyLimitRow, KeySpendRow } from './openrouter-credits';
import { KeyStatusRow, PasteKeyRow, RemoveKeyRow } from './openrouter-key';

interface KeyFacts {
  readonly owner: boolean;
  readonly keySet: boolean;
  readonly account: OpenRouterAccount | undefined;
}

function useKeyFacts(): KeyFacts {
  const owner = useIsOwner();
  const status = useOpenRouterStatus();
  const keySet = status.data?.key === 'set';
  const account = useOpenRouterAccount(keySet).data;
  return { owner, keySet, account };
}

function limitRow({ owner, account }: KeyFacts): ReactNode {
  const limit = account?.limit ?? null;
  if (!owner || account === undefined || limit === null) {
    return null;
  }
  return <KeyLimitRow key="limit" account={account} limit={limit} />;
}

function SpentWithKey({ owner, account }: KeyFacts): ReactNode {
  if (!owner || account === undefined) {
    return null;
  }
  return (
    <List inset title="Spent with this key">
      <KeySpendRow key="today" title="Today" field="usage_daily" account={account} />
      <KeySpendRow key="week" title="This week" field="usage_weekly" account={account} />
      <KeySpendRow key="month" title="This month" field="usage_monthly" account={account} />
    </List>
  );
}

export function OpenRouterSection(): ReactNode {
  const facts = useKeyFacts();
  const { owner, keySet } = facts;
  return (
    <>
      <List inset title="OpenRouter" {...(owner ? {} : { footer: MEMBER_FOOTER })}>
        <KeyStatusRow key="status" />
        {owner ? <PasteKeyRow key="paste" /> : null}
        {owner && keySet ? <RemoveKeyRow key="remove" /> : null}
        {owner && keySet ? <CreditRow key="credit" /> : null}
        {limitRow(facts)}
        <DefaultModelRow key="default" />
      </List>
      <SpentWithKey {...facts} />
    </>
  );
}
