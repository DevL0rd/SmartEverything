import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../../../components/banner';
import type { StatusTone } from '../../../../../components/tone';
import type { InspectorFinding, SectionProps } from './section-types';

const TONE: Readonly<Record<InspectorFinding['severity'], StatusTone>> = {
  error: 'critical',
  warning: 'warning',
  hint: 'info',
};

const RANK: Readonly<Record<InspectorFinding['severity'], number>> = {
  error: 0,
  warning: 1,
  hint: 2,
};

function rankedFindings(findings: readonly InspectorFinding[]): readonly InspectorFinding[] {
  return [...findings].sort((left, right) => RANK[left.severity] - RANK[right.severity]);
}

function fixAction(
  found: InspectorFinding,
  fix: (id: string) => void,
): { readonly action?: { readonly label: string; readonly onPress: () => void } } {
  if (found.fix === undefined) return {};
  return {
    action: {
      label: found.fix,
      onPress: (): void => {
        fix(found.id);
      },
    },
  };
}

export function Problems({ env, actions }: SectionProps): ReactNode {
  return (
    <View className="gap-2 px-4">
      {rankedFindings(env.findings).map((found) => (
        <Banner
          key={found.id}
          tone={TONE[found.severity]}
          title={found.message}
          wrapBody
          {...fixAction(found, actions.fix)}
        />
      ))}
    </View>
  );
}
