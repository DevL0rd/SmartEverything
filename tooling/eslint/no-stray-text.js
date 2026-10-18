const TEXT_SUFFIX = /Text$/;
const INTRINSIC = /^[a-z]/;

function elementName(node) {
  const name = node.openingElement.name;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return name.property.name;
  return '';
}

function isStringChild(child) {
  if (child.type === 'JSXText') return child.value.trim() !== '' || !child.value.includes('\n');
  if (child.type !== 'JSXExpressionContainer') return false;
  const { expression } = child;
  if (expression.type === 'Literal') return typeof expression.value === 'string';
  return expression.type === 'TemplateLiteral';
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid string children outside a Text component: React Native throws when a View or fragment receives raw text.',
    },
    schema: [
      {
        type: 'object',
        properties: { textComponents: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      stray:
        'Raw text is rendered outside a Text component and crashes React Native. Wrap it in <Text>, or remove it.',
    },
  },
  create(context) {
    const textComponents = new Set(context.options[0]?.textComponents ?? []);
    const report = (node) => {
      for (const child of node.children) {
        if (isStringChild(child)) context.report({ node: child, messageId: 'stray' });
      }
    };
    return {
      JSXElement(node) {
        const name = elementName(node);
        if (INTRINSIC.test(name) || TEXT_SUFFIX.test(name) || textComponents.has(name)) return;
        report(node);
      },
      JSXFragment: report,
    };
  },
};
