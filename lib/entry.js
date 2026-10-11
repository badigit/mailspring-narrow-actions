'use strict';

const fs = require('fs');
const path = require('path');
const statusPath = path.join(__dirname, '..', 'status.json');
let plugin;

function status(state, detail = {}) {
  try {
    fs.writeFileSync(statusPath, JSON.stringify({
      version: require('../package.json').version,
      state,
      updatedAt: new Date().toISOString(),
      ...detail,
    }, null, 2));
  } catch (error) {
    console.warn('Narrow Thread Actions: could not write load status', error.message);
  }
}

exports.activate = () => {
  try {
    plugin = require('./main');
    plugin.activate();
    status('active');
  } catch (error) {
    status('failed', { error: error.message });
    throw error;
  }
};

exports.deactivate = () => {
  if (plugin) plugin.deactivate();
  status('inactive');
};
