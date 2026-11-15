import tseslint from 'typescript-eslint';
import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
}).run('no-raw-modal', await localRule('no-raw-modal'), {
  valid: [
    { code: "import { ToastModal } from '../components/toast-modal';" },
    { code: "import { View, Pressable } from 'react-native';" },
    { code: "import type { ModalProps } from 'react-native';" },
    { code: "import { type Modal, View } from 'react-native';" },
    { code: "import { Modal } from 'react-native-modal';" },
  ],
  invalid: [
    { code: "import { Modal } from 'react-native';", errors: [{ messageId: 'raw' }] },
    {
      code: "import { ActivityIndicator, Modal as Sheet, View } from 'react-native';",
      errors: [{ messageId: 'raw' }],
    },
  ],
});
