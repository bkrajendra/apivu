import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifest: {
    name: 'apiVU',
    description: 'Turn browser cURL into editable REST API requests.',
    minimum_chrome_version: '116',
    permissions: ['storage'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: 'Open Apivu API Tester',
    },
  },
});
