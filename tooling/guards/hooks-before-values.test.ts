import tseslint from 'typescript-eslint';
import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
}).run('hooks-before-values', await localRule('hooks-before-values'), {
  valid: [
    {
      code: "function Medallion({ size }) { const pointer = useIdiom() === 'pointer'; const theme = useUniwind().theme; const geometry = medallionGeometry(size, pointer); return <View style={boxStyle(geometry.px)} theme={theme} />; }",
    },
    {
      code: 'function Pill({ percent }) { const look = levelLook(percent); const lit = useColour(look.fill); return <View colour={lit} word={wordOf(look)} />; }',
    },
    {
      code: 'function Row({ rows }) { const ordered = orderOf(rows); const drag = useNavDrag(ordered); return <List rows={ordered.map(nameOf)} drag={drag} />; }',
    },
    {
      code: 'function Label({ device }) { const label = nameOf(device); const now = useMinute(); return <Text now={now}>{label}</Text>; }',
    },
    {
      code: 'function Card({ device }) { const ready = device.state === "ready"; const now = useMinute(); return <Text now={now} ready={ready} />; }',
    },
    {
      code: 'function Card({ list }) { const pick = (id) => select(list, id); const now = useMinute(); return <Menu onPick={pick} now={now} />; }',
    },
    {
      code: 'function rowsOf(list) { const sorted = sortOf(list); const now = useMinute(); return format(sorted, now); }',
    },
  ],
  invalid: [
    {
      code: "function Medallion({ size }) { const geometry = medallionGeometry(size, useIdiom() === 'pointer'); return <View style={boxStyle(geometry.px)} />; }",
      errors: [{ messageId: 'hookInsideValue', data: { hook: 'useIdiom()', value: 'geometry' } }],
    },
    {
      code: "function Medallion({ size, pointer }) { const geometry = medallionGeometry(size, pointer); const strength = STRENGTH[useUniwind().theme === 'light' ? 'light' : 'dark']; return <View style={boxStyle(geometry.px)} strength={strength} />; }",
      errors: [{ messageId: 'hookAfterValue', data: { hook: 'useUniwind()', value: 'geometry' } }],
    },
    {
      code: 'function useFeed(filter) { const shape = shapeOf(filter); const owner = useIsOwner(); return pagesOf(shape, owner); }',
      errors: [{ messageId: 'hookAfterValue', data: { hook: 'useIsOwner()', value: 'shape' } }],
    },
    {
      code: 'const Rows = memo(function Rows({ items }) { const shown = items.filter(isShown); const width = useAreaWidth(); return <List items={shown.slice(0, width)} />; });',
      errors: [{ messageId: 'hookAfterValue', data: { hook: 'useAreaWidth()', value: 'shown' } }],
    },
  ],
});
