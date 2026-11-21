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
  ],
});
