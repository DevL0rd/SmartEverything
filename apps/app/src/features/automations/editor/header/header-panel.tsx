import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AdmitSection } from './admit-section';
import { BudgetsSection } from './budgets-section';
import type { HeaderEnv } from './header-types';
import { InputsSection, OutputsSection } from './io-section';
import { PolicySection } from './policy-section';
import { TriggersSection } from './triggers-section';
import { VariablesSection } from './variables-section';

export function HeaderPanel({ env }: { readonly env: HeaderEnv }): ReactNode {
  return (
    <View className="gap-6 pb-6">
      <TriggersSection env={env} />
      <AdmitSection env={env} />
      <InputsSection env={env} />
      <OutputsSection env={env} />
      <VariablesSection env={env} />
      <PolicySection env={env} />
      <BudgetsSection env={env} />
    </View>
  );
}
