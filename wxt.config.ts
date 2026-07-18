import { defineConfig } from 'wxt';

export default defineConfig({
  modules: [],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: '0.4.29',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      96: 'icon-96.png',
      128: 'icon-128.png',
    },
    action: {
      default_title: '__MSG_actionTitle__',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: 'lingua-bridge@omnidev.local',
        strict_min_version: '109.0',
      },
    },
  },
});
