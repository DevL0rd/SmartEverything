import { RuleTester, localRule } from './lint-rule-tester';

const OPTIONS = {
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
} as const;

const CHARTS = "import { Arc, Gauge, ProgressBar } from '../../components/charts';\n";
const MEDALLION = "import { ServiceMedallion } from '../shared/service-medallion';\n";
const CLOCK = "import { useSecondOf } from '../../store/clock';\n";
const STREAM = "import { useRouterSnapshot } from '../router-data';\n";
const FIGURE = "import { Figure } from '../../components/figure';\n";
const PLUGIN = "import { useStreamValue } from './use-stream-value';\n";

const missing = (name: string): { messageId: string; data: { name: string } }[] => [
  { messageId: 'missingTicking', data: { name } },
];

new RuleTester(OPTIONS).run('chart-ticking', await localRule('chart-ticking'), {
  valid: [
    { code: `${CHARTS}const bar = <ProgressBar progress={0.4} ticking={false} />;` },
    { code: `${CHARTS}${CLOCK}const bar = <ProgressBar progress={left / total} ticking />;` },
    { code: `${CHARTS}const gauge = <Gauge value={left} ticking={running} />;` },
    { code: `${MEDALLION}${STREAM}const medal = <ServiceMedallion ratio={hero.ratio} ticking />;` },
    {
      code: "import * as Charts from '../../components/charts';\nconst ring = <Charts.Arc value={left} ticking />;",
    },
    { code: `${CHARTS}const text = <Text>{left}</Text>;` },
    { code: 'function Gauge() { return null; }\nconst local = <Gauge steps={steps} />;' },
    { code: 'const ring = <Arc value={0.4} />;' },
    { code: `${FIGURE}const figure = <Figure value={count(rooms)} size="m" />;` },
    {
      code: `${FIGURE}${STREAM}function Hero({ hero }) { const snap = useRouterSnapshot(); return <Figure value={hero.value} />; }`,
    },
    {
      code: `${FIGURE}${STREAM}const snapshot = useRouterSnapshot();\nconst figure = <Figure value={other.snapshot} />;`,
    },
    {
      code: "import { LiveFigure } from '../../components/live-figure';\nconst snap = useRouterSnapshot();\nconst figure = <LiveFigure value={snap.value} />;",
    },
  ],
  invalid: [
    {
      code: `${CHARTS}${CLOCK}const bar = <ProgressBar progress={left / total} label="Left" />;`,
      errors: missing('ProgressBar'),
    },
    {
      code: `${MEDALLION}${STREAM}const medal = <ServiceMedallion ratio={lineShare(network.downloadMbps, last)} />;`,
      errors: missing('ServiceMedallion'),
    },
    {
      code: `${CHARTS}${STREAM}const gauge = <Gauge value={system.cpuPercent} min={0} max={100} />;`,
      errors: missing('Gauge'),
    },
    { code: `${CHARTS}const ring = <Arc value={share} />;`, errors: missing('Arc') },
    {
      code: "import { Arc as Ring } from '../../components/charts';\nconst ring = <Ring value={share} />;",
      errors: missing('Arc'),
    },
    {
      code: "import * as Charts from '../../components/charts';\nconst ring = <Charts.Arc value={left} />;",
      errors: missing('Arc'),
    },
    { code: `${CHARTS}const bar = <ProgressBar {...props} />;`, errors: missing('ProgressBar') },
    {
      code: `${FIGURE}${STREAM}const snapshot = useRouterSnapshot();\nconst { network } = snapshot.data;\nconst rate = rateParts(network.downloadMbps);\nconst figure = <Figure value={rate.value} size="m" />;`,
      errors: [{ messageId: 'streamFigure' }],
    },
    {
      code: `${FIGURE}${PLUGIN}function View() { const reading = textReading(useStreamValue(id, key)); return <Figure value={reading.text} />; }`,
      errors: [{ messageId: 'streamFigure' }],
    },
    {
      code: `${FIGURE}${CLOCK}const left = useSecondOf((now) => end - now);\nconst figure = <Figure value={formatNumber(left)} />;`,
      errors: [{ messageId: 'streamFigure' }],
    },
    {
      code: `${FIGURE}${STREAM}const figure = <Figure value={useRouterSnapshot().data.rate} />;`,
      errors: [{ messageId: 'streamFigure' }],
    },
  ],
});
