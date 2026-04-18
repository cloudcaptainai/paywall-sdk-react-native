const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, '..');

// Watch the SDK source for live reloads during development.
config.watchFolders = [workspaceRoot];

// The SDK's own node_modules (installed at the repo root for its own dev
// tooling) may contain older copies of react/react-native. Block those from
// Metro's lookup so the example's versions are the only ones in play.
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(path.resolve(workspaceRoot, 'node_modules', 'react') + '/.*'),
  new RegExp(path.resolve(workspaceRoot, 'node_modules', 'react-native') + '/.*'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Prefer the SDK's TypeScript source (package.json "source" field) so edits
// under ../src propagate without rebuilding lib/.
config.resolver.resolverMainFields = [
  'source',
  ...(config.resolver.resolverMainFields ?? ['react-native', 'browser', 'main']),
];

module.exports = config;
