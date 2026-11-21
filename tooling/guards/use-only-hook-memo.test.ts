import tseslint from 'typescript-eslint';
import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
}).run('use-only-hook-memo', await localRule('use-only-hook-memo'), {
  valid: [
    { code: 'function useColour(role) { return resolveColour(use(PaletteContext), role) + ""; }' },
    { code: 'function useTheme() { return use(ThemeContext); }' },
    { code: 'function useTail() { const tail = use(Tail); return tail; }' },
    {
      code: 'function useResolver() { const palette = useContext(Palette); return (role) => palette[role]; }',
    },
    {
      code: "function useResolver() { 'use memo'; const palette = use(Palette); return (role) => palette[role]; }",
    },
    {
      code: 'function useBand(children) { const tail = use(Tail); const [fit] = useState(0); return { tail, fit }; }',
    },
    {
      code: 'function resolverOf() { const palette = use(Palette); return (role) => palette[role]; }',
    },
    { code: 'function useOpen() { const flag = useFlag(); return () => use(Other); }' },
    { code: 'function useLabel() { const scope = use(Scope); return scope.label; }' },
  ],
  invalid: [
    {
      code: 'function useColourResolver() { const palette = use(PaletteContext); return (role) => resolveColour(palette, role); }',
      errors: [{ messageId: 'skipped' }],
    },
    {
      code: 'export const useScrollLayoutEvent = () => { const scroll = use(Scroll); return function () { scroll.bump(); }; };',
      errors: [{ messageId: 'skipped' }],
    },
    {
      code: 'function useBandItems(children) { const tail = use(Tail); const items = Children.toArray(children); return { items, tail }; }',
      errors: [{ messageId: 'skipped' }],
    },
    {
      code: 'function useStates() { const scope = use(Scope); return textsOf(scope.ports.states); }',
      errors: [{ messageId: 'skipped' }],
    },
    {
      code: 'function useIds() { const scope = React.use(Scope); return [scope.a, scope.b]; }',
      errors: [{ messageId: 'skipped' }],
    },
    {
      code: 'const useFallback = (action) => ({ current: action ?? use(Shell) });',
      errors: [{ messageId: 'skipped' }],
    },
    {
      code: 'function useShownPins(pins) { const fold = use(Fold); return fold ? pins.filter((pin) => pin.wired) : pins; }',
      errors: [{ messageId: 'skipped' }],
    },
    {
      code: 'function useRows(rows) { const scope = use(Scope); return scope.rows ?? rows.map(nameOf); }',
      errors: [{ messageId: 'skipped' }],
    },
  ],
});
