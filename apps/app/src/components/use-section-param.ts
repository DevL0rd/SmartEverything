import { useLocalSearchParams, useRouter } from 'expo-router';

export type SectionParam = readonly [
  value: string | null,
  set: (next: string) => void,
  clear: () => void,
];

export function sectionParamOf(
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
  name: string,
): string | null {
  const value = params[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

export function useSectionParam(name: string): SectionParam {
  const router = useRouter();
  return [
    sectionParamOf(useLocalSearchParams(), name),
    (next): void => {
      router.setParams({ [name]: next });
    },
    (): void => {
      router.setParams({ [name]: undefined });
    },
  ];
}
