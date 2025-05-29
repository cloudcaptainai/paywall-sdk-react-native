# Releases and CI / CD

## GitHub Actions Workflows

This repository uses two automated workflows to automate releases:

### 1. Test and Validate (`run-tests.yml`)

**Triggers:**
- Pull requests opened or updated against the `main` branch
- Called by other workflows

**What it does:**
- Sets up Node.js environment
- Installs dependencies with `yarn install --frozen-lockfile`
- (TODO) Runs code linting with `yarn lint`
- (TODO) Performs type checking with `yarn typecheck`
- Executes tests with `yarn test` (TODO - add tests)
- Builds the package with `yarn build`
- Validates publishing readiness with `npm publish --dry-run`

### 2. Create Release and Publish (`create-release.yml`)

**Triggers:**
- Pushes to `main` branch that modify `package.json`
- Manual workflow dispatch

**What it does:**
- Detects version changes by comparing current and previous `package.json`
- If version changed (or manually triggered):
  - Runs the test workflow
  - Creates a git tag with the new version
  - Creates a GitHub release with auto-generated notes
  - Builds the package for distribution
  - Publishes the package to npm registry

## Release Process

To release a new version:

1. **Update version**: Modify the `version` field in `package.json`
2. **Update helium-swift dependency (optional)**: Update the dependency version in `PaywallSdkReactNative.podspec`
3. **Commit and push**: Push your changes to the `main` branch
4. **Automatic flow**:
  - Release workflow detects version change
  - Runs tests and if successful
  - Creates git tag and GitHub release
  - Package is built and published to npm

## Development Workflow

### Local Development
Match the CI environment locally:
- Use Node.js version 20 (or latest LTS)
- Use `yarn install` for dependencies
