import { useLocalSearchParams, useRouter } from 'expo-router';

export function usePresenceSelection(
  key: string,
  initial: string | null = null,
): readonly [string | null, (value: string | null) => void] {
  const params = useLocalSearchParams();
  const router = useRouter();
  const written = params[key];
  const selected = typeof written === 'string' && written !== '' ? written : initial;
  return [
    selected,
    (value): void => {
      router.setParams({
        focus: undefined,
        param: undefined,
        control: undefined,
        action: undefined,
        [key]: value ?? undefined,
      });
    },
  ];
}
