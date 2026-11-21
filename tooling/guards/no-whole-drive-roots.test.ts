import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'no-whole-drive-roots',
  await localRule('no-whole-drive-roots'),
  {
    valid: [
      { code: 'const roots = useDriveRootPlaces();' },
      { code: 'const root = useDriveRoot(rootId);' },
      { code: 'const size = useDriveRootBytes(rootId);' },
      { code: "const albums = useRows('drive_albums');" },
    ],
    invalid: [
      {
        code: 'const roots = useDriveRoots();',
        errors: [{ messageId: 'whole' }],
      },
      {
        code: 'const href = openHrefOf(item, useDriveRoots());',
        errors: [{ messageId: 'whole' }],
      },
      {
        code: "const roots = useRows('drive_roots');",
        errors: [{ messageId: 'whole' }],
      },
    ],
  },
);
