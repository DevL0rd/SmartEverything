const DRAWN_CHARTS = new Set(['Arc', 'ProgressBar', 'Gauge', 'ServiceMedallion']);

function importedCharts(program) {
  const named = new Map();
  const namespaces = new Set();
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportNamespaceSpecifier') {
        namespaces.add(specifier.local.name);
      } else if (
        specifier.type === 'ImportSpecifier' &&
        specifier.importKind !== 'type' &&
        specifier.imported.type === 'Identifier' &&
        DRAWN_CHARTS.has(specifier.imported.name)
      ) {
        named.set(specifier.local.name, specifier.imported.name);
      }
    }
  }
  return { named, namespaces };
}

function chartName(element, charts) {
  const { name } = element;
  if (name.type === 'JSXIdentifier') return charts.named.get(name.name) ?? null;
  if (
    name.type === 'JSXMemberExpression' &&
    name.object.type === 'JSXIdentifier' &&
    charts.namespaces.has(name.object.name) &&
    name.property.type === 'JSXIdentifier' &&
    DRAWN_CHARTS.has(name.property.name)
  ) {
    return name.property.name;
  }
  return null;
}

function hasTicking(element) {
  return element.attributes.some(
    (attribute) =>
      attribute.type === 'JSXAttribute' &&
      attribute.name.type === 'JSXIdentifier' &&
      attribute.name.name === 'ticking',
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Every drawn chart must say whether its value is live, so a value fed by the clock or a live stream does not restart the 700 ms draw-in animation on every update.',
    },
    schema: [],
    messages: {
      missingTicking:
        '<{{name}}> must pass `ticking`: true when its value follows the clock or a live stream (useDraw then sets each new value instead of restarting the draw-in animation), false when it changes only on discrete events.',
    },
  },
  create(context) {
    let charts = { named: new Map(), namespaces: new Set() };
    return {
      Program(program) {
        charts = importedCharts(program);
      },
      JSXOpeningElement(element) {
        const name = chartName(element, charts);
        if (name === null || hasTicking(element)) return;
        context.report({ node: element, messageId: 'missingTicking', data: { name } });
      },
    };
  },
};
