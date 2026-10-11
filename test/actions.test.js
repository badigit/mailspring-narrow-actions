'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadPlugin({ emptyRegistry = false } = {}) {
  let component;
  let canArchive = true;
  let canTrash = true;
  let tasks = [{ id: 'queued-task' }];
  const queued = [];
  const calls = [];
  const originalTimestamp = () => null;
  const registry = emptyRegistry ? [] : [originalTimestamp];
  const listeners = new Set();
  const perspective = {
    canArchiveThreads: () => canArchive,
    canMoveThreadsTo: () => canTrash,
  };
  const sdk = {
    localized: (value) => value,
    ComponentRegistry: {
      findComponentsMatching: () => [...registry],
      register: (value, options) => {
        assert.equal(options.role, 'ThreadListTimestamp');
        registry.push(value);
        if (value.displayName === 'NarrowThreadTimestampWithActions') component = value;
      },
      unregister: (value) => {
        const index = registry.indexOf(value);
        if (index !== -1) registry.splice(index, 1);
      },
      listen: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    FocusedPerspectiveStore: { current: () => perspective },
    TaskFactory: {
      tasksForArchiving: (args) => { calls.push(['archive', args]); return tasks; },
      tasksForMovingToTrash: (args) => { calls.push(['trash', args]); return tasks; },
    },
    Actions: { queueTasks: (value) => queued.push(value) },
  };
  const exports = {};
  const appRequire = (name) => {
      if (name === 'mailspring-exports') return sdk;
      if (name === 'react') return { createElement: (type, props, ...children) => ({ type, props, children }) };
      throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/main.js'), 'utf8'), {
    exports,
    AppEnv: { getLoadSettings: () => ({ resourcePath: '/running-app/app.asar' }) },
    require: (name) => {
      if (name === 'path') return path;
      if (name === 'module') return { createRequire: () => appRequire };
      throw new Error(`Unexpected external dependency: ${name}`);
    },
  }, { timeout: 1000 });
  exports.activate();
  return {
    exports, perspective, calls, queued, registry, originalTimestamp, sdk, listeners,
    notifyRegistry: () => [...listeners].forEach((listener) => listener()),
    render: (thread) => component({ thread }).children[1],
    renderTimestamp: (props) => component(props).children[0],
    setPermissions: (archive, trash) => { canArchive = archive; canTrash = trash; },
    setTasks: (value) => { tasks = value; },
  };
}

function click(button) {
  const event = {
    stopped: false, prevented: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  button.props.onClick(event);
  assert.ok(event.stopped && event.prevented, 'Do not open/select the row when acting');
}

test('archive and trash dispatch native tasks for the exact row, without acting on mount', () => {
  const plugin = loadPlugin();
  const thread = { id: 'this-row' };
  const buttons = plugin.render(thread).children[0];
  assert.equal(plugin.queued.length, 0);
  assert.deepEqual(Array.from(buttons, (b) => b.props['aria-label']), ['Archive', 'Trash']);
  click(buttons[0]);
  click(buttons[1]);
  assert.equal(plugin.queued.length, 2);
  assert.equal(plugin.calls[0][0], 'archive');
  assert.equal(plugin.calls[0][1].threads[0], thread);
  assert.equal(plugin.calls[0][1].perspective, plugin.perspective);
  assert.equal(plugin.calls[1][0], 'trash');
  assert.equal(plugin.calls[1][1].threads[0], thread);
  plugin.exports.deactivate();
});

test('existing reminder timestamp is delegated unchanged and restored on deactivation', () => {
  const plugin = loadPlugin();
  const props = { thread: { id: 'row' }, fallback: () => null };
  const timestamp = plugin.renderTimestamp(props);
  assert.equal(timestamp.type, plugin.originalTimestamp);
  assert.equal(timestamp.props, props);
  assert.equal(plugin.registry.length, 1);
  plugin.exports.activate();
  assert.equal(plugin.registry.length, 1, 'Activation is idempotent');
  plugin.exports.deactivate();
  assert.deepEqual(plugin.registry, [plugin.originalTimestamp]);
  plugin.exports.deactivate();
  assert.deepEqual(plugin.registry, [plugin.originalTimestamp]);
});

test('folder permissions hide forbidden actions and are checked again on click', () => {
  const plugin = loadPlugin();
  const thread = { id: 'this-row' };
  const buttons = plugin.render(thread).children[0];
  plugin.setPermissions(false, false);
  click(buttons[0]);
  click(buttons[1]);
  assert.equal(plugin.calls.length, 0);
  assert.equal(plugin.render(thread), null);
  plugin.setPermissions(false, true);
  assert.equal(plugin.render(thread).children[0].length, 1);
  assert.equal(plugin.render(thread).children[0][0].props['aria-label'], 'Trash');
});

test('empty task result does not queue a false success', () => {
  const plugin = loadPlugin();
  plugin.setTasks([]);
  click(plugin.render({ id: 'this-row' }).children[0][0]);
  assert.equal(plugin.queued.length, 0);
});

test('uses fallback without identity and adopts a timestamp registered after activation', () => {
  const plugin = loadPlugin({ emptyRegistry: true });
  const fallback = () => null;
  const props = { thread: { id: 'row' }, fallback };
  assert.equal(plugin.renderTimestamp(props).type, fallback);
  const reminderTimestamp = () => null;
  plugin.registry.push(reminderTimestamp);
  plugin.notifyRegistry();
  assert.equal(plugin.registry.length, 1, 'The injected role has a single renderer');
  assert.equal(plugin.renderTimestamp(props).type, reminderTimestamp);
  plugin.notifyRegistry();
  plugin.exports.deactivate();
  assert.deepEqual(plugin.registry, [reminderTimestamp]);
  assert.equal(plugin.listeners.size, 0);
});

test('rows awaiting a registry update remain safe after deactivation', () => {
  const plugin = loadPlugin();
  plugin.exports.deactivate();
  assert.equal(plugin.renderTimestamp({ thread: { id: 'row' } }).type, plugin.originalTimestamp);
  assert.equal(plugin.render({ id: 'row' }), null);
  plugin.exports.activate();
  assert.equal(plugin.registry.length, 1);
  assert.equal(plugin.listeners.size, 1);
  plugin.exports.deactivate();
});

test('empty registry with no fallback stays safe before and after deactivation', () => {
  const plugin = loadPlugin({ emptyRegistry: true });
  assert.equal(plugin.renderTimestamp({ thread: { id: 'row' } }), null);
  plugin.exports.deactivate();
  assert.equal(plugin.renderTimestamp({ thread: { id: 'row' } }), null);
  assert.equal(plugin.registry.length, 0);
});

test('mouse actions keep list focus and only activation keys stop propagation', () => {
  const plugin = loadPlugin();
  const button = plugin.render({ id: 'row' }).children[0][0];
  const mouse = { preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  button.props.onMouseDown(mouse);
  assert.ok(mouse.prevented && mouse.stopped);
  for (const key of ['Enter', ' ', 'Spacebar', 'ArrowDown', 'a', 'Escape']) {
    for (const handler of ['onKeyDown', 'onKeyUp']) {
      const event = { key, stopped: false, stopPropagation() { this.stopped = true; } };
      button.props[handler](event);
      assert.equal(event.stopped, ['Enter', ' ', 'Spacebar'].includes(key));
    }
  }
});

test('unregistering an absent component does not remove the timestamp', () => {
  const plugin = loadPlugin();
  const before = [...plugin.registry];
  plugin.sdk.ComponentRegistry.unregister(() => null);
  assert.deepEqual(plugin.registry, before);
});
