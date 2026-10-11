// EAS derlemesinde google-services.json, GOOGLE_SERVICES_JSON dosya değişkeninden gelir (depoda yok).
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
