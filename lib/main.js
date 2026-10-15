'use strict';

// External packages are outside app.asar's node_modules lookup path.
// Use the running application's React and exports, including after app updates.
const path = require('path');
const appRequire = require('module').createRequire(
  path.join(AppEnv.getLoadSettings().resourcePath, 'package.json')
);
const React = appRequire('react');
const installNotificationTrash = require('./notification-trash');
const sdk = appRequire('mailspring-exports');
const {
  Actions,
  ComponentRegistry,
  FocusedPerspectiveStore,
  TaskFactory,
  localized,
} = sdk;

const source = 'Narrow Thread Actions';
const stopPropagation = (event) => event.stopPropagation();
const stopActivationKey = (event) => {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.stopPropagation();
  }
};
let previousTimestamps = null;
let unlistenRegistry = null;
let active = false;
let uninstallNotificationTrash = null;

function icon(kind) {
  const paths = kind === 'archive'
    ? ['M3 3h18v4H3z', 'M5 7v14h14V7', 'M9 11h6']
    : ['M3 6h18', 'M9 6V3h6v3', 'M5 6l1 15h12l1-15', 'M10 10v7', 'M14 10v7'];
  return React.createElement('svg', {
    viewBox: '0 0 24 24', width: 18, height: 18,
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: false,
  }, paths.map((d, i) => React.createElement('path', { key: i, d })));
}

function permitted(kind, perspective, thread) {
  return kind === 'archive'
    ? perspective.canArchiveThreads([thread])
    : perspective.canMoveThreadsTo([thread], 'trash');
}

function actionButton(kind, thread) {
  const title = localized(kind === 'archive' ? 'Archive' : 'Trash');
  return React.createElement('button', {
    key: kind,
    type: 'button',
    className: `narrow-thread-action narrow-thread-action-${kind}`,
    title,
    'aria-label': title,
    onMouseDown(event) {
      event.preventDefault();
      event.stopPropagation();
    },
    onDoubleClick: stopPropagation,
    onKeyDown: stopActivationKey,
    onKeyUp: stopActivationKey,
    onClick(event) {
      event.preventDefault();
      event.stopPropagation();
      // Recheck the current folder: it may have changed since the row rendered.
      const perspective = FocusedPerspectiveStore.current();
      if (!permitted(kind, perspective, thread)) return;
      const tasks = kind === 'archive'
        ? TaskFactory.tasksForArchiving({ threads: [thread], source, perspective })
        : TaskFactory.tasksForMovingToTrash({ threads: [thread], source });
      if (tasks.length) Actions.queueTasks(tasks);
    },
  }, icon(kind));
}

function NarrowThreadActions({ thread }) {
  const perspective = FocusedPerspectiveStore.current();
  const buttons = ['archive', 'trash']
    .filter((kind) => permitted(kind, perspective, thread))
    .map((kind) => actionButton(kind, thread));
  if (!buttons.length) return null;
  return React.createElement('div', {
    className: 'narrow-thread-actions',
    role: 'group',
    'aria-label': localized('Actions'),
  }, buttons);
}

function TimestampWithActions(props) {
  const Timestamp = (previousTimestamps || [])[0] || props.fallback;
  return React.createElement(React.Fragment, null,
    Timestamp ? React.createElement(Timestamp, props) : null,
    active ? NarrowThreadActions(props) : null);
}

TimestampWithActions.displayName = 'NarrowThreadTimestampWithActions';
TimestampWithActions.containerRequired = false;

exports.activate = () => {
  if (active) return;
  // The icon slot is capped at one component and already occupied by built-ins.
  // Decorate the timestamp instead, delegating to its existing reminder renderer.
  previousTimestamps = ComponentRegistry.findComponentsMatching({ role: 'ThreadListTimestamp' });
  previousTimestamps.forEach((component) => ComponentRegistry.unregister(component));
  ComponentRegistry.register(TimestampWithActions, { role: 'ThreadListTimestamp' });
  active = true;
  uninstallNotificationTrash = installNotificationTrash(sdk);
  // Identity-only packages can register their timestamp after this package loads.
  // Keep this role's single renderer and delegate to the newly available timestamp.
  unlistenRegistry = ComponentRegistry.listen(() => {
    if (!active) return;
    const added = ComponentRegistry.findComponentsMatching({ role: 'ThreadListTimestamp' })
      .filter((component) => component !== TimestampWithActions);
    if (!added.length) return;
    previousTimestamps = [...added, ...previousTimestamps.filter((component) => !added.includes(component))];
    added.forEach((component) => ComponentRegistry.unregister(component));
  });
};
exports.deactivate = () => {
  if (!active) return;
  active = false;
  if (uninstallNotificationTrash) uninstallNotificationTrash();
  uninstallNotificationTrash = null;
  if (unlistenRegistry) unlistenRegistry();
  unlistenRegistry = null;
  ComponentRegistry.unregister(TimestampWithActions);
  previousTimestamps.forEach((component) => ComponentRegistry.register(component, {
    role: 'ThreadListTimestamp',
  }));
  // Keep the delegate for rows awaiting the registry's debounced notification.
};
