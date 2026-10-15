'use strict';

module.exports = function installNotificationTrash(sdk, {
  platform = process.platform,
  onError = (error) => console.error('Narrow Thread Actions: notification action failed', error),
} = {}) {
  if (platform !== 'win32') return () => {};
  const { NativeNotifications, DatabaseStore, Thread, TaskFactory, Actions, localized } = sdk;
  const original = NativeNotifications.displayNotification;
  let active = true;

  function displayNotification(options = {}) {
    const { threadId, messageId, actions, onActivate } = options;
    const isMail = active && threadId && messageId && options.tag === `thread-${threadId}`
      && Array.isArray(actions) && actions.length === 2
      && actions[0].text === localized('Mark as Read')
      && actions[1].text === localized('Archive') && typeof onActivate === 'function';
    if (!isMail) return original.call(this, options);
    return original.call(this, {
      ...options,
      actions: [...actions, { type: 'button', text: localized('Delete') }],
      async onActivate(result) {
        if (result.activationType !== 'action' || result.actionIndex !== 2) {
          return onActivate.call(this, result);
        }
        if (!active) return;
        try {
          // The thread may have moved or disappeared since this toast was shown.
          const thread = await DatabaseStore.find(Thread, threadId);
          if (!active || !thread || thread.categories.some((category) => category.role === 'trash')) return;
          const tasks = TaskFactory.tasksForMovingToTrash({
            threads: [thread], source: 'Notification Action',
          });
          if (tasks.length) Actions.queueTasks(tasks);
        } catch (error) {
          onError(error);
        }
      },
    });
  }

  NativeNotifications.displayNotification = displayNotification;
  return () => {
    active = false;
    if (NativeNotifications.displayNotification === displayNotification) {
      NativeNotifications.displayNotification = original;
    }
  };
};
