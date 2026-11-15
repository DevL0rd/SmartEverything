import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'no-device-list-slice',
  await localRule('no-device-list-slice'),
  {
    valid: [
      { code: 'const devices = useDevices({ includeHidden: true });' },
      { code: 'const robots = vacuumRobots(useDevices());' },
      { code: "const names = useDeviceNames('label');" },
      { code: 'const people = new Map(useProfiles().map((p) => [p.id, p.name]));' },
    ],
    invalid: [
      {
        code: 'const names = new Map(useDevices().map((device) => [device.id, device.label]));',
        errors: [{ messageId: 'map' }, { messageId: 'slice' }],
      },
      {
        code: 'const vacuum = useDevices().find((device) => device.kind === "vacuum") ?? null;',
        errors: [{ messageId: 'slice' }],
      },
      {
        code: 'const has = useDevices({ includeHidden: true }).some(isScale);',
        errors: [{ messageId: 'slice' }],
      },
      {
        code: 'const key = useDevices({ includeHidden: true }).filter(isTreadmill).map((d) => d.id).join(",");',
        errors: [{ messageId: 'slice' }],
      },
    ],
  },
);
