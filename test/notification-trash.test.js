'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const install = require('../lib/notification-trash');

function setup({ platform = 'win32' } = {}) {
  const shown = [], queued = [], forwarded = [], errors = [], lookups = [];
  let thread = { id: 'thread-1', categories: [{ role: 'inbox' }] };
  let tasks = [{ id: 'move-to-trash' }];
  let findError = null;
  const handle = { id: 'toast-1', close() {} };
  const native = { displayNotification(options) {
    assert.equal(this, native);
    shown.push(options);
    return handle;
  } };
  const original = native.displayNotification;
  const sdk = {
    NativeNotifications: native,
    localized: (text) => text,
    Thread: class Thread {},
    DatabaseStore: { async find(type, id) {
      lookups.push([type, id]);
      if (findError) throw findError;
      return thread;
    } },
    TaskFactory: { tasksForMovingToTrash({ threads, source }) {
      assert.equal(threads[0], thread);
      assert.equal(source, 'Notification Action');
      return tasks;
    } },
    Actions: { queueTasks: (value) => queued.push(value) },
  };
  const dispose = install(sdk, { platform, onError: (error) => errors.push(error) });
  const options = {
    threadId: 'thread-1', messageId: 'message-1', tag: 'thread-thread-1',
    title: 'Test sender', body: 'Test notification',
    actions: [{ type: 'button', text: 'Mark as Read' }, { type: 'button', text: 'Archive' }],
    onActivate: (result) => forwarded.push(result),
  };
  return {
    native, original, sdk, options, handle, shown, queued, forwarded, errors, lookups, dispose,
    setThread: (value) => { thread = value; },
    setTasks: (value) => { tasks = value; },
    failLookup: (error) => { findError = error; },
  };
}

test('adds Delete to individual mail toasts without mutating options or replacing the handle', () => {
  const env = setup();
  assert.equal(env.native.displayNotification(env.options), env.handle);
  assert.deepEqual(env.shown[0].actions.map((action) => action.text), ['Mark as Read', 'Archive', 'Delete']);
  assert.equal(env.options.actions.length, 2);
  assert.equal(env.shown[0].body, env.options.body);
  assert.equal(env.queued.length, 0);
});

test('delegates read, archive, reply and body-click activation unchanged', async () => {
  const env = setup();
  env.native.displayNotification(env.options);
  for (const result of [
    { activationType: 'action', actionIndex: 0 },
    { activationType: 'action', actionIndex: 1 },
    { activationType: 'clicked' },
    { activationType: 'replied', response: 'A reply' },
  ]) {
    await env.shown[0].onActivate(result);
    assert.equal(env.forwarded.at(-1), result);
  }
  assert.equal(env.lookups.length, 0);
});

test('Delete fetches the current thread and queues only its native move-to-trash task', async () => {
  const env = setup();
  env.native.displayNotification(env.options);
  await env.shown[0].onActivate({ activationType: 'action', actionIndex: 2 });
  assert.deepEqual(env.lookups, [[env.sdk.Thread, 'thread-1']]);
  assert.equal(env.queued.length, 1);
  assert.equal(env.forwarded.length, 0);
});

test('missing threads, threads already in trash and unavailable trash folders do not queue actions', async () => {
  for (const state of ['missing', 'trash', 'no-tasks']) {
    const env = setup();
    env.native.displayNotification(env.options);
    if (state === 'missing') env.setThread(null);
    if (state === 'trash') env.setThread({ id: 'thread-1', categories: [{ role: 'trash' }] });
    if (state === 'no-tasks') env.setTasks([]);
    await env.shown[0].onActivate({ activationType: 'action', actionIndex: 2 });
    assert.equal(env.queued.length, 0);
    assert.equal(env.errors.length, 0);
  }
});

test('database errors are reported without an unhandled rejection', async () => {
  const env = setup();
  const error = new Error('Database unavailable');
  env.failLookup(error);
  env.native.displayNotification(env.options);
  await env.shown[0].onActivate({ activationType: 'action', actionIndex: 2 });
  assert.deepEqual(env.errors, [error]);
  assert.equal(env.queued.length, 0);
});

test('leaves other notifications and other platforms unchanged', () => {
  const env = setup();
  for (const options of [
    {}, { ...env.options, messageId: undefined }, { ...env.options, tag: 'activity' },
    { ...env.options, actions: [] }, { ...env.options, actions: [...env.options.actions, { text: 'Other' }] },
  ]) {
    env.native.displayNotification(options);
    assert.equal(env.shown.at(-1), options);
  }
  const other = setup({ platform: 'darwin' });
  assert.equal(other.native.displayNotification, other.original);
});

test('deactivation restores the original method and disables already displayed Delete buttons', async () => {
  const env = setup();
  env.native.displayNotification(env.options);
  env.dispose();
  assert.equal(env.native.displayNotification, env.original);
  await env.shown[0].onActivate({ activationType: 'action', actionIndex: 2 });
  assert.equal(env.lookups.length, 0);
  assert.equal(env.queued.length, 0);
});

test('deactivation preserves a later wrapper and cancels an in-flight lookup', async () => {
  const env = setup();
  let resolve;
  env.sdk.DatabaseStore.find = () => new Promise((done) => { resolve = done; });
  env.native.displayNotification(env.options);
  const pending = env.shown[0].onActivate({ activationType: 'action', actionIndex: 2 });
  const laterWrapper = () => {};
  env.native.displayNotification = laterWrapper;
  env.dispose();
  resolve({ id: 'thread-1', categories: [{ role: 'inbox' }] });
  await pending;
  assert.equal(env.native.displayNotification, laterWrapper);
  assert.equal(env.queued.length, 0);
});
