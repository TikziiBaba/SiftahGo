// Uygulama içi güncelleme gönderir: npm run update -- "mesaj" [kanal]
// EXPO_PUBLIC_* değerleri eas.json'daki derleme profilinden alınır; böylece .env.local'daki
// geliştirme adresleri (ör. localhost) güncellemeye girmez.
const { spawnSync } = require('child_process');
const eas = require('../eas.json');

const [message, channel = 'preview'] = process.argv.slice(2);
if (!message) {
  console.error('Kullanım: npm run update -- "değişiklik açıklaması" [preview|production]');
  process.exit(1);
}

const { status } = spawnSync(
  'npx',
  ['eas-cli@latest', 'update', '--channel', channel, '--environment', channel, '--message', JSON.stringify(message)],
  { stdio: 'inherit', shell: true, env: { ...process.env, ...eas.build.base.env } },
);
process.exit(status ?? 1);
