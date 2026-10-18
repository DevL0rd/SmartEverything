const PREFIX = 'SmartEverything voice ';
const states = new Map();
const watched = new Set();
const NAME = 'org.smarteverything.Overlay';
const PATH = '/overlay';
const FREE = /^free@(\d(?:\.\d+)?),(\d(?:\.\d+)?)$/;
const TRAY_GAP = 10;
const SIDE_GAP = 12;
let pillWindow = null;
let fullscreen = false;

function parse(caption) {
  if (typeof caption !== 'string' || !caption.startsWith(PREFIX)) {
    return null;
  }
  const parts = caption.slice(PREFIX.length).split(' ');
  const inset = Number(parts[4]);
  if (parts.length !== 5 || !Number.isFinite(inset)) {
    return null;
  }
  return { role: parts[0], anchor: parts[1], output: parts[2], focus: parts[3] === '1', inset };
}

const ORIGIN = /^(-?\d+),(-?\d+)$/;

function outputOf(token, state) {
  const origin = ORIGIN.exec(token);
  if (origin !== null) {
    const found = workspace.screens.find(
      (screen) =>
        screen.geometry.x === Number(origin[1]) && screen.geometry.y === Number(origin[2]),
    );
    state.output = found === undefined ? workspace.activeScreen : found;
  } else if (state.output === null) {
    state.output = workspace.activeScreen;
  }
  return state.output;
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function freeTarget(window, request, area, free) {
  const size = window.frameGeometry;
  const pill = request.role === 'tray' && pillWindow !== null ? pillWindow.frameGeometry : null;
  const centreX = pill === null ? area.x + free.cx * area.width : pill.x + pill.width / 2;
  let y = area.y + free.cy * area.height - size.height / 2;
  if (pill !== null) {
    const below = pill.y + pill.height / 2 < area.y + area.height / 2;
    y = below ? pill.y + pill.height + TRAY_GAP : pill.y - TRAY_GAP - size.height;
  }
  return {
    x: clamp(Math.round(centreX - size.width / 2), area.x, area.x + area.width - size.width),
    y: clamp(Math.round(y), area.y, area.y + area.height - size.height),
    width: size.width,
    height: size.height,
  };
}

function target(window, request, state) {
  const area = workspace.clientArea(
    KWin.PlacementArea,
    outputOf(request.output, state),
    workspace.currentDesktop,
  );
  const free = FREE.exec(request.anchor);
  if (free !== null && request.role !== 'glow') {
    return freeTarget(window, request, area, { cx: Number(free[1]), cy: Number(free[2]) });
  }
  const size = window.frameGeometry;
  const width = request.role === 'glow' ? area.width : size.width;
  const [vertical, horizontal] = request.anchor.split('-');
  const x =
    horizontal === 'left'
      ? area.x + SIDE_GAP
      : horizontal === 'right'
        ? area.x + area.width - width - SIDE_GAP
        : area.x + Math.round((area.width - width) / 2);
  const y =
    vertical === 'top'
      ? area.y + request.inset
      : area.y + area.height - size.height - request.inset;
  return { x, y, width, height: size.height };
}

function settle(window, request, state) {
  const wanted = target(window, request, state);
  const now = window.frameGeometry;
  if (now.x !== wanted.x || now.y !== wanted.y || now.width !== wanted.width) {
    window.frameGeometry = wanted;
  }
}

function focus(window, wanted) {
  const state = states.get(window);
  if (wanted && !state.focused) {
    state.focused = true;
    state.previous = workspace.activeWindow;
    workspace.activeWindow = window;
  } else if (!wanted && state.focused) {
    state.focused = false;
    const previous = state.previous;
    state.previous = null;
    if (previous !== null && workspace.activeWindow === window) {
      workspace.activeWindow = previous;
    }
  }
}

function place(window) {
  const request = parse(window.caption);
  if (request === null) {
    return;
  }
  const state = states.get(window);
  if (!state.moving) {
    settle(window, request, state);
  }
  focus(window, request.focus);
  reportFullscreen();
}

function release(window) {
  const state = states.get(window);
  states.delete(window);
  if (window === pillWindow) {
    pillWindow = null;
  }
  reportFullscreen();
  if (state === undefined || !state.focused) {
    return;
  }
  const previous = state.previous;
  if (previous !== null && workspace.windowList().includes(previous)) {
    workspace.activeWindow = previous;
  }
}

function moved(window) {
  const state = states.get(window);
  if (state === undefined) {
    return;
  }
  state.moving = false;
  if (state.role !== 'pill') {
    return;
  }
  const area = workspace.clientArea(KWin.PlacementArea, state.output, workspace.currentDesktop);
  const frame = window.frameGeometry;
  const cx = clamp((frame.x + frame.width / 2 - area.x) / area.width, 0, 1);
  const cy = clamp((frame.y + frame.height / 2 - area.y) / area.height, 0, 1);
  callDBus(NAME, PATH, NAME, 'Moved', cx, cy);
}

function overlayOutput() {
  for (const state of states.values()) {
    if (state.output !== null) {
      return state.output;
    }
  }
  return null;
}

function reportFullscreen() {
  const output = overlayOutput();
  const now =
    output !== null &&
    workspace
      .windowList()
      .some((other) => !states.has(other) && other.fullScreen && other.output.name === output.name);
  if (now !== fullscreen) {
    fullscreen = now;
    callDBus(NAME, PATH, NAME, 'Fullscreen', now);
  }
}

function adopt(window) {
  if (states.has(window)) {
    return;
  }
  const request = parse(window.caption);
  states.set(window, {
    focused: false,
    previous: null,
    output: null,
    moving: false,
    role: request.role,
  });
  if (request.role === 'pill') {
    pillWindow = window;
  }
  window.skipTaskbar = true;
  window.skipSwitcher = true;
  window.skipPager = true;
  window.keepAbove = true;
  window.onAllDesktops = true;
  window.excludeFromCapture = true;
  window.captionChanged.connect(() => place(window));
  window.frameGeometryChanged.connect(() => place(window));
  window.interactiveMoveResizeStarted.connect(() => {
    states.get(window).moving = true;
  });
  window.interactiveMoveResizeFinished.connect(() => moved(window));
  place(window);
}

const waiting = new Map();

function stopWaiting(window) {
  const handler = waiting.get(window);
  if (handler !== undefined) {
    window.captionChanged.disconnect(handler);
    waiting.delete(window);
  }
}

function watch(window) {
  if (!watched.has(window)) {
    watched.add(window);
    window.fullScreenChanged.connect(reportFullscreen);
  }
}

function consider(window) {
  watch(window);
  if (parse(window.caption) !== null) {
    adopt(window);
  } else if (window.caption === '' && !waiting.has(window)) {
    const handler = () => {
      if (window.caption !== '') {
        stopWaiting(window);
        consider(window);
      }
    };
    waiting.set(window, handler);
    window.captionChanged.connect(handler);
  }
}

workspace.windowAdded.connect(consider);
workspace.windowRemoved.connect((window) => {
  stopWaiting(window);
  watched.delete(window);
  release(window);
});
workspace.windowList().forEach(consider);
callDBus(NAME, PATH, NAME, 'Ready');
