import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'no-raw-external-store',
  await localRule('no-raw-external-store'),
  {
    valid: [
      { code: "import { usePausable } from '../design/external-store';" },
      { code: "import { useState } from 'react';" },
      { code: 'const value = usePausable(store.subscribe, store.get);' },
    ],
    invalid: [
      {
        code: "import { useSyncExternalStore } from 'react';",
        errors: [{ messageId: 'raw' }],
      },
      {
        code: "import { use, useSyncExternalStore as sync } from 'react';",
        errors: [{ messageId: 'raw' }],
      },
      {
        code: 'const value = React.useSyncExternalStore(subscribe, read, read);',
        errors: [{ messageId: 'raw' }],
      },
    ],
  },
);
