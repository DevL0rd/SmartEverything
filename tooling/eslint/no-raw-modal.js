export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid the raw react-native Modal so every modal unmounts its portal while closed.',
    },
    schema: [],
    messages: {
      raw: 'The raw react-native Modal keeps a portal and its event listeners on the page while closed. Use ToastModal from components/toast-modal, which mounts the Modal only while it is shown.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'react-native' || node.importKind === 'type') return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.importKind !== 'type' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'Modal'
          ) {
            context.report({ node: specifier, messageId: 'raw' });
          }
        }
      },
    };
  },
};
