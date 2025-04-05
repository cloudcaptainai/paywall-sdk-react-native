// withModularHeaders.js
const { withDangerousMod } = require('@expo/config-plugins');
const { resolve } = require('path');
const fs = require('fs');

const withModularHeadersPods = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      try {
        const podfilePath = resolve(
          config.modRequest.platformProjectRoot,
          'Podfile'
        );

        if (!fs.existsSync(podfilePath)) {
          console.warn('Podfile not found at path:', podfilePath);
          return config;
        }

        let podfileContent = fs.readFileSync(podfilePath, 'utf8');

        // Check for existing pod declarations with any quote style
        const heliumRegex =
          /pod\s+(['"])Helium\1\s*,?\s*:modular_headers\s*=>\s*true/;
        const analyticsRegex =
          /pod\s+(['"])Analytics\1\s*,?\s*:modular_headers\s*=>\s*true/;

        const heliumExists = heliumRegex.test(podfileContent);
        const analyticsExists = analyticsRegex.test(podfileContent);

        // Remove existing declarations without modular_headers
        if (!heliumExists) {
          const existingHeliumRegex =
            /pod\s+(['"])Helium\1(?!\s*,\s*:modular_headers\s*=>)/;
          if (existingHeliumRegex.test(podfileContent)) {
            podfileContent = podfileContent.replace(
              /pod\s+(['"])Helium\1[^,\n]*(?!:modular_headers)/g,
              "pod 'Helium', :modular_headers => true"
            );
          }
        }

        if (!analyticsExists) {
          const existingAnalyticsRegex =
            /pod\s+(['"])Analytics\1(?!\s*,\s*:modular_headers\s*=>)/;
          if (existingAnalyticsRegex.test(podfileContent)) {
            podfileContent = podfileContent.replace(
              /pod\s+(['"])Analytics\1[^,\n]*(?!:modular_headers)/g,
              "pod 'Analytics', :modular_headers => true"
            );
          }
        }

        // If pods don't exist at all, add them
        if (
          (!heliumExists && !podfileContent.includes("pod 'Helium'")) ||
          (!analyticsExists && !podfileContent.includes("pod 'Analytics'"))
        ) {
          const podsToAdd = [];

          if (!heliumExists && !podfileContent.includes("pod 'Helium'")) {
            podsToAdd.push("  pod 'Helium', :modular_headers => true");
          }

          if (!analyticsExists && !podfileContent.includes("pod 'Analytics'")) {
            podsToAdd.push("  pod 'Analytics', :modular_headers => true");
          }

          // Look for the main app target (usually has the app name)
          const appName = config.modRequest.projectName || '';
          const mainTargetRegex = new RegExp(
            `target\\s+(['"])${appName}\\1\\s+do`
          );
          const mainTargetMatch = podfileContent.match(mainTargetRegex);

          // Fall back to first target if main target not found
          const targetMatch =
            mainTargetMatch || podfileContent.match(/target\s+['"].*['"]\s+do/);

          if (targetMatch && targetMatch.index !== undefined) {
            // Find the position right after the target line
            const targetPos =
              podfileContent.indexOf('\n', targetMatch.index) + 1;

            // Insert the new pods after the target line
            podfileContent =
              podfileContent.substring(0, targetPos) +
              podsToAdd.join('\n') +
              '\n' +
              podfileContent.substring(targetPos);
          } else {
            // If no target block found, add at the end
            podfileContent += '\n' + podsToAdd.join('\n') + '\n';
          }
        }

        fs.writeFileSync(podfilePath, podfileContent);
      } catch (error) {
        console.error('Error in withModularHeadersPods plugin:', error);
      }

      return config;
    },
  ]);
};

module.exports = withModularHeadersPods;
