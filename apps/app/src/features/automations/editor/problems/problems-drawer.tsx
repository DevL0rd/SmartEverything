import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SheetHeader } from '../../../../components/sheet-header';
import type { LiveCheck } from './problem-model';
import type { ProblemHandlers } from './problem-rows';
import { ProblemList } from './problem-rows';
import { problemsTitle } from './problems-sheet';

export interface ProblemsDrawerProps extends ProblemHandlers {
  readonly check: LiveCheck;
  readonly onClose: () => void;
}

export function ProblemsDrawer({ check, onClose, onGoTo, onFix }: ProblemsDrawerProps): ReactNode {
  return (
    <View
      accessibilityLabel="Problems"
      className="h-full w-inspector max-w-full border-l border-outline-variant bg-surface-raised"
    >
      <View className="pt-4">
        <SheetHeader title={problemsTitle(check)} onClose={onClose} touch={false} />
      </View>
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="pt-2">
        <ProblemList groups={check.groups} handlers={{ onGoTo, onFix }} />
      </ScrollView>
    </View>
  );
}
