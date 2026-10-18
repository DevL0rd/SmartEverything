import { vi } from 'vitest';

interface TestRouter {
  readonly push: ReturnType<typeof vi.fn>;
  readonly replace: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.fn>;
  readonly back: ReturnType<typeof vi.fn>;
  readonly dismiss: ReturnType<typeof vi.fn>;
  readonly dismissAll: ReturnType<typeof vi.fn>;
  readonly canGoBack: ReturnType<typeof vi.fn>;
  readonly setParams: ReturnType<typeof vi.fn>;
}

interface TestNavigation {
  readonly addListener: ReturnType<typeof vi.fn>;
  readonly setOptions: ReturnType<typeof vi.fn>;
  readonly goBack: ReturnType<typeof vi.fn>;
  readonly canGoBack: ReturnType<typeof vi.fn>;
}

export const router: TestRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  navigate: vi.fn(),
  back: vi.fn(),
  dismiss: vi.fn(),
  dismissAll: vi.fn(),
  canGoBack: vi.fn(() => false),
  setParams: vi.fn(),
};

const navigation: TestNavigation = {
  addListener: vi.fn(() => vi.fn()),
  setOptions: vi.fn(),
  goBack: vi.fn(),
  canGoBack: vi.fn(() => false),
};

export const useRouter = (): TestRouter => router;
export const useNavigation = (): TestNavigation => navigation;
export const useLocalSearchParams = (): Record<string, string> => ({});
export const useGlobalSearchParams = (): Record<string, string> => ({});
export const usePathname = (): string => '/';
export const useSegments = (): readonly string[] => [];
export const useRoute = (): { readonly key: string; readonly name: string } => ({
  key: 'route',
  name: 'index',
});
export const useIsFocused = (): boolean => true;
export const useFocusEffect = (effect: () => unknown): void => {
  effect();
};
export const useScrollToTop = (): void => undefined;
export const useRootNavigationState = (): undefined => undefined;
export const useNavigationContainerRef = (): { readonly current: null } => ({ current: null });
export const useSitemap = (): null => null;

const renderNothing = (): null => null;

export const Redirect = renderNothing;
export const Link = renderNothing;
export const Stack = Object.assign(renderNothing, { Screen: renderNothing });
export const ThemeProvider = renderNothing;
export const DarkTheme = { dark: true, colors: { background: '#000000' } } as const;
export const SplashScreen = {
  hideAsync: (): Promise<void> => Promise.resolve(),
  preventAutoHideAsync: (): Promise<void> => Promise.resolve(),
};
