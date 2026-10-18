import { useEffect, useState } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { resumeGuardedRemoval } from '../../../app-shell/tab-replacement';
import { confirm } from '../../../components/confirm-store';
import { background } from '@smarteverything/logging';

export function useDiscardPrompt(dirty: boolean): void {
  const navigation = useNavigation();
  usePreventRemove(dirty, ({ data }) => {
    background(
      confirm({
        title: 'Discard changes?',
        body: 'Your edits will be lost.',
        confirmLabel: 'Discard',
        tone: 'destructive',
      }).then((discard) => {
        resumeGuardedRemoval(navigation, data.action, discard);
      }),
      'editor_navigation.confirm_failed',
    );
  });
}

export function useClose(): readonly [boolean, () => void] {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (closing) router.back();
  }, [closing, router]);
  return [
    closing,
    (): void => {
      setClosing(true);
    },
  ];
}

export function useReloadSaved(): () => void {
  const router = useRouter();
  return (): void => {
    background(
      confirm({
        title: 'Reload saved definition?',
        body: 'This replaces your local edits with the current saved definition. Cancel keeps your draft.',
        confirmLabel: 'Reload saved',
      }).then((accepted) => {
        if (accepted) router.setParams({ reload: String(Date.now()) });
      }),
      'editor_navigation.confirm_failed',
    );
  };
}
