const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../..');
const defaultConfig = getDefaultConfig(__dirname);

// Regex-escape resolved paths before building blockList entries so
// metacharacters in directory names (and Windows separators) match literally.
const escapeForRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  // Watch the SDK source for live reloads during development.
  watchFolders: [workspaceRoot],
  resolver: {
    // The SDK's own node_modules (installed at the repo root for its dev
    // tooling) may contain older copies of react/react-native. Block those from
    // Metro's lookup so this example's versions are the only ones in play.
    blockList: [
      ...Array.from(defaultConfig.resolver.blockList ?? []),
      new RegExp(
        escapeForRegExp(path.resolve(workspaceRoot, 'node_modules', 'react')) +
          '/.*',
      ),
      new RegExp(
        escapeForRegExp(
          path.resolve(workspaceRoot, 'node_modules', 'react-native'),
        ) + '/.*',
      ),
    ],
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    // Prefer the SDK's TypeScript source (package.json "source" field) so edits
    // under ../../src propagate without rebuilding lib/.
    resolverMainFields: [
      'source',
      ...(defaultConfig.resolver.resolverMainFields ?? [
        'react-native',
        'browser',
        'main',
      ]),
    ],
  },
  transformer: {
    // The SDK requires expo-file-system inside try/catch for fallback-bundle
    // handling. Without this flag Metro fails the bundle in apps (like this
    // one) that don't have Expo installed.
    allowOptionalDependencies: true,
  },
};

module.exports = mergeConfig(defaultConfig, config);
