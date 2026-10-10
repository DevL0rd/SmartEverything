import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import local from './tooling/eslint/rules.js';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '.stryker-tmp/**',
      'reports/**',
      'apps/*/dist/**',
      '**/dist-types/**',
      '.agents/**',
      'apps/*/.expo/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.cts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['vitest.config.ts', 'vitest.mutation.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    plugins: { local },
    rules: {
      'local/no-comments': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-return-await': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression[typeAnnotation.typeName.name!="const"]',
          message: 'Type assertions are forbidden. Parse and validate instead.',
        },
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read environment variables through the validated env module only.',
        },
        {
          selector: 'CatchClause[param=null]',
          message:
            'A catch that does not bind the error discards it. Bind it and say what failed, what was expected and what was received.',
        },
      ],
      complexity: ['error', 10],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 4],
      'max-params': ['error', 4],
    },
  },
  {
    files: ['apps/desktop/src/preload.cts'],
    rules: {
      '@typescript-eslint/no-require-imports': ['error', { allow: ['^electron$'] }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.contract.test.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['apps/app/**/*.tsx', 'apps/app/**/*.ts'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: '19.2.3' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      'local/worklet-calls-worklets': 'error',
      'react/jsx-no-leaked-render': 'error',
      'react/no-unstable-nested-components': 'error',
      'react/jsx-key': 'error',
      'react/self-closing-comp': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression[typeAnnotation.typeName.name!="const"]',
          message: 'Type assertions are forbidden. Parse and validate instead.',
        },
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read environment variables through the validated env module only.',
        },
        {
          selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression",
          message: 'Use Uniwind classes and design tokens, never inline style objects.',
        },
        {
          selector: "JSXOpeningElement[name.name='Svg'] > JSXAttribute[name.name='className']",
          message:
            'Svg ignores className on Android; wrap it in a View that carries the layout classes.',
        },
        {
          selector: 'Literal[value=/(^|\\s|:)-?[a-z][a-z0-9-]*-\\[[^\\]]+\\]/]',
          message:
            'Arbitrary Tailwind values are forbidden; use a design token or the spacing scale.',
        },
        {
          selector: 'TemplateElement[value.raw=/(^|\\s|:)-?[a-z][a-z0-9-]*-\\[[^\\]]+\\]/]',
          message:
            'Arbitrary Tailwind values are forbidden; use a design token or the spacing scale.',
        },
      ],
    },
  },
  {
    files: ['apps/app/src/components/**', 'apps/app/src/design/**', 'apps/app/src/format/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^\\.\\./(\\.\\./)*(store|api|queries|features|app-shell|settings|search)(/|$)',
              message: 'The kit, design and format layers stay free of data and features.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/app/src/features/**'],
    ignores: ['apps/app/src/features/root/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^\\.\\./(activity|automations|cameras|climate|connections|devices|device-visuals|fitness|health-log|home|more|nutrition|pairing|privacy|profiles|settings)/(?!index$)',
              message: 'Import another feature only through its public features/<name>/index.ts.',
            },
            {
              regex:
                '^\\.\\./\\.\\./(activity|automations|cameras|climate|connections|devices|device-visuals|fitness|health-log|home|more|nutrition|pairing|privacy|profiles)/(?!index$)',
              message: 'Import another feature only through its public features/<name>/index.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-undef': 'off',
    },
  },
  {
    files: ['apps/app/app.config.ts', 'apps/app/src/platform/build-env.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['apps/app/src/features/cameras/player/video-surface.web.tsx'],
    rules: { 'jsx-a11y/media-has-caption': 'off' },
  },
);
