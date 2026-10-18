import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { List, Section } from '../../../components/section';
import { count } from '../../../format/number';
import { ruleLines } from './own-rules';
import { RuleRow } from './rule-row';

const FOOTER = 'Edit other rules in AdGuard Home.';

export function MyRules({ rules }: { readonly rules: readonly string[] }): ReactNode {
  const lines = ruleLines(rules);
  if (lines.length === 0) {
    return (
      <Section title="My rules" footer={FOOTER}>
        <Card>
          <EmptyState
            compact
            icon="list"
            title="No rules of your own"
            body="Block it and Always allow it add rules here."
          />
        </Card>
      </Section>
    );
  }
  return (
    <List title="My rules" caption={count(lines.length)} footer={FOOTER}>
      {lines.map((line) => (
        <RuleRow key={line.text} line={line} />
      ))}
    </List>
  );
}
