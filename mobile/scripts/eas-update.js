// Uygulama içi güncelleme gönderir: npm run update [-- production]
// Önce src/lib/changelog.json'a yeni kayıt ekleyin; uygulama açılışta onu "Yenilikler" olarak gösterir,
// güncelleme mesajı da o kayıttan alınır.
// EXPO_PUBLIC_* değerleri eas.json'daki derleme profilinden alınır; böylece .env.local'daki
// geliştirme adresleri (ör. localhost) güncellemeye girmez.
const { spawnSync } = require('child_process');
const eas = require('../eas.json');
const changelog = require('../src/lib/changelog.json');

const channel = process.argv[2] ?? 'preview';
const entry = changelog.reduce((a, b) => (b.id > a.id ? b : a));
const message = `#${entry.id} ${entry.items.join(' · ')}`;
console.log(`Gönderilecek yenilikler (${channel}): ${message}\n`);

const { status } = spawnSync(
  'npx',
  ['eas-cli@latest', 'update', '--channel', channel, '--environment', channel, '--message', JSON.stringify(message)],
  { stdio: 'inherit', shell: true, env: { ...process.env, ...eas.build.base.env } },
);
process.exit(status ?? 1);
