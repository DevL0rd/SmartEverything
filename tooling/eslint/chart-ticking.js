const DRAWN_CHARTS = new Set(['Arc', 'ProgressBar', 'Gauge', 'ServiceMedallion']);
const COUNTING_FIGURES = new Set(['Figure']);
const STREAM_HOOKS = new Set([
  'useRouterSnapshot',
  'useWatchedRouterSnapshot',
  'usePluginStream',
  'useSourceLive',
  'useStreamValue',
  'useStreamSeries',
  'useComputerPart',
  'useLiveSeries',
  'useSecondOf',
]);

function importedCharts(program, wanted) {
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
        wanted.has(specifier.imported.name)
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

function boundNames(pattern, names) {
  if (pattern === null) return names;
  switch (pattern.type) {
    case 'Identifier':
      names.push(pattern.name);
      break;
    case 'ObjectPattern':
      for (const property of pattern.properties) {
        boundNames(property.type === 'RestElement' ? property.argument : property.value, names);
      }
      break;
    case 'ArrayPattern':
      for (const element of pattern.elements) boundNames(element, names);
      break;
    case 'RestElement':
      boundNames(pattern.argument, names);
      break;
    case 'AssignmentPattern':
      boundNames(pattern.left, names);
      break;
  }
  return names;
}

function readsStream(node, live, keys) {
  if (node === null || typeof node !== 'object') return false;
  if (node.type === 'Identifier') return live.has(node.name);
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    STREAM_HOOKS.has(node.callee.name)
  ) {
    return true;
  }
  if (node.type === 'MemberExpression' && !node.computed) {
    return readsStream(node.object, live, keys);
  }
  if (node.type === 'Property' && !node.computed) return readsStream(node.value, live, keys);
  for (const key of keys[node.type] ?? []) {
    const child = node[key];
    const children = Array.isArray(child) ? child : [child];
    if (children.some((item) => readsStream(item, live, keys))) return true;
  }
  return false;
}

function liveNames(declarators, keys) {
  const live = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const declarator of declarators) {
      const names = boundNames(declarator.id, []);
      if (names.every((name) => live.has(name))) continue;
      if (!readsStream(declarator.init, live, keys)) continue;
      for (const name of names) live.add(name);
      grew = true;
    }
  }
  return live;
}

function valueOf(element) {
  const attribute = element.attributes.find(
    (item) =>
      item.type === 'JSXAttribute' &&
      item.name.type === 'JSXIdentifier' &&
      item.name.name === 'value' &&
      item.value?.type === 'JSXExpressionContainer',
  );
  return attribute === undefined ? null : attribute.value.expression;
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
        'Every drawn chart must say whether its value is live, so a value fed by the clock or a live stream does not restart the 700 ms draw-in animation on every update, and a counting Figure must not show a live value.',
    },
    schema: [],
    messages: {
      streamFigure:
        '<Figure> counts every change of its value up frame by frame; this value follows a live stream or the clock, so render it with <LiveFigure> (minimum change and widest reserved) instead.',
      missingTicking:
        '<{{name}}> must pass `ticking`: true when its value follows the clock or a live stream (useDraw then sets each new value instead of restarting the draw-in animation), false when it changes only on discrete events.',
    },
  },
  create(context) {
    let charts = { named: new Map(), namespaces: new Set() };
    let figures = new Map();
    const declarators = [];
    const shown = [];
    return {
      Program(program) {
        charts = importedCharts(program, DRAWN_CHARTS);
        figures = importedCharts(program, COUNTING_FIGURES).named;
      },
      VariableDeclarator(declarator) {
        declarators.push(declarator);
      },
      JSXOpeningElement(element) {
        if (element.name.type === 'JSXIdentifier' && figures.has(element.name.name)) {
          const value = valueOf(element);
          if (value !== null) shown.push({ element, value });
          return;
        }
        const name = chartName(element, charts);
        if (name === null || hasTicking(element)) return;
        context.report({ node: element, messageId: 'missingTicking', data: { name } });
      },
      'Program:exit'() {
        if (shown.length === 0) return;
        const keys = context.sourceCode.visitorKeys;
        const live = liveNames(declarators, keys);
        for (const { element, value } of shown) {
          if (readsStream(value, live, keys)) {
            context.report({ node: element, messageId: 'streamFigure' });
          }
        }
      },
    };
  },
};
