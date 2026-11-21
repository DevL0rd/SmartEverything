import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'no-hot-table-rows',
  await localRule('no-hot-table-rows'),
  {
    valid: [
      { code: "const rooms = useRows('rooms');" },
      { code: "const groups = useRows('device_groups');" },
      { code: 'const names = useAutomationNames();' },
      { code: "const names = useDeviceNames('label');" },
      { code: 'const rows = useRows(table);' },
      { code: 'const clients = rowsOf(state.tables.clients).some((client) => client.id === own);' },
      { code: 'const devices = useDevices(); const rows = devices.map((device) => device.id);' },
      { code: 'const { rows, byId } = useAutomations(); const first = rows[0];' },
      { code: 'const list = useAutomations(); const names = list.rows.map((row) => row.name);' },
      {
        code: 'function Zone() { const devices = useDevices(); const shown = devices.filter((device) => device.hidden); return () => devices.find((device) => device.id === id); }',
      },
      { code: 'const computers = computersOf(useDevices());' },
      { code: 'const device = useDevice(id);' },
    ],
    invalid: [
      {
        code: "const options = useRows('automations').map((row) => ({ value: row.id, label: row.name }));",
        errors: [{ messageId: 'hot', data: { table: 'automations' } }],
      },
      {
        code: "const lights = useRows('devices').filter((device) => device.kind === 'light');",
        errors: [{ messageId: 'hot', data: { table: 'devices' } }],
      },
      {
        code: "const owner = useRows('clients').some((client) => client.role === 'owner');",
        errors: [{ messageId: 'hot', data: { table: 'clients' } }],
      },
      {
        code: 'const runs = useRows(`automation_runs`);',
        errors: [{ messageId: 'hot', data: { table: 'automation_runs' } }],
      },
      {
        code: "const days = useRows('health_daily');",
        errors: [{ messageId: 'hot', data: { table: 'health_daily' } }],
      },
      {
        code: 'const name = useAutomations().byId.get(id)?.name ?? null;',
        errors: [{ messageId: 'lookup', data: { hook: 'useAutomations' } }],
      },
      {
        code: 'const { byId } = useAutomations(); const row = byId.get(id);',
        errors: [{ messageId: 'lookup', data: { hook: 'useAutomations' } }],
      },
      {
        code: 'const list = useAutomations(); const row = list.byId.get(id);',
        errors: [{ messageId: 'lookup', data: { hook: 'useAutomations' } }],
      },
      {
        code: 'const device = computersOf(useDevices()).find((item) => item.id === id);',
        errors: [{ messageId: 'lookup', data: { hook: 'useDevices' } }],
      },
      {
        code: 'const parent = useDevices({ includeHidden: true }).find((item) => item.id === id);',
        errors: [{ messageId: 'lookup', data: { hook: 'useDevices' } }],
      },
      {
        code: 'const devices = useDevices(); const parent = devices.find((item) => item.id === id); const any = devices.length > 0;',
        errors: [{ messageId: 'lookup', data: { hook: 'useDevices' } }],
      },
      {
        code: 'function Map() { const devices = useDevices({ includeHidden: true }); const choose = (key) => devices.find((device) => device.external_id === key); return choose; }',
        errors: [{ messageId: 'lookup', data: { hook: 'useDevices' } }],
      },
      {
        code: 'function List({ zones }) { const devices = useDevices(); return zones.map((zone) => devices.find((item) => item.external_id === zone.id)); }',
        errors: [{ messageId: 'lookup', data: { hook: 'useDevices' } }],
      },
    ],
  },
);
