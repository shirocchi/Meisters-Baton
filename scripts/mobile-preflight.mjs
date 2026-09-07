import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
let failures = 0;
const report = (ok, label, action, required = true) => {
  console.log(`${ok ? 'OK' : required ? 'ACTION' : 'REVIEW'}  ${label}${ok ? '' : ` — ${action}`}`);
  if (!ok && required) failures++;
};
async function exists(file) {
  try {
    return (await stat(path.resolve(root, file))).isFile();
  } catch {
    return false;
  }
}
async function read(file) {
  try {
    return await readFile(path.resolve(root, file), 'utf8');
  } catch {
    return '';
  }
}
function https(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

console.log(`Meister's Baton / ${release ? 'store preparation' : 'source preparation'} checks`);
report(
  Number(process.versions.node.split('.')[0]) >= 22,
  'Node.js 22 or newer',
  'Install Node.js 22+.',
);
const config = await read('capacitor.config.ts');
report(
  config.includes('jp.meisters.baton') && config.includes("webDir: 'dist'"),
  'Application identity and web directory',
  'Review capacitor.config.ts and register the same identity in both stores.',
);
report(
  !/server\s*:\s*\{[^}]*url\s*:/s.test(config),
  'Web assets are bundled',
  'Remove the live-reload server URL from the release configuration.',
);
report(
  !/allowMixedContent\s*:\s*true/.test(config),
  'Mixed content is disabled',
  'Disable allowMixedContent in capacitor.config.ts.',
);
report(
  await exists('dist/index.html'),
  'Production web assets exist',
  'Run npm run build, then npm run mobile:sync.',
);

const android = await read('android/app/src/main/AndroidManifest.xml');
report(
  android.includes('android:allowBackup="false"') &&
    android.includes('android:dataExtractionRules="@xml/data_extraction_rules"'),
  'Android automatic backup exclusions',
  'Restore the manifest and backup exclusion rules.',
);
report(
  android.includes('android:usesCleartextTraffic="false"'),
  'Android HTTPS-only network policy',
  'Disable cleartext traffic for the release app.',
);
report(
  android.includes('android.permission.CAMERA') &&
    android.includes('android.permission.RECORD_AUDIO'),
  'Android capture permission declarations',
  'Declare camera/microphone permissions and verify runtime permission denial.',
);
const variables = await read('android/variables.gradle');
report(
  /minSdkVersion\s*=\s*24/.test(variables) && /targetSdkVersion\s*=\s*36/.test(variables),
  'Android SDK 24 minimum / 36 target',
  'Review SDK values against the installed Capacitor version and current store requirements.',
);
const info = await read('ios/App/App/Info.plist');
report(
  info.includes('NSCameraUsageDescription') && info.includes('NSMicrophoneUsageDescription'),
  'iOS permission purpose descriptions',
  'Provide accurate Japanese camera and microphone descriptions.',
);
report(
  !/NSAllowsArbitraryLoads<\/key>\s*<true/.test(info),
  'iOS transport protection',
  'Remove arbitrary transport exceptions.',
);
const privacy = await read('ios/App/App/PrivacyInfo.xcprivacy');
report(
  privacy.includes('NSPrivacyAccessedAPICategoryFileTimestamp') && privacy.includes('C617.1'),
  'Filesystem required-reason declaration',
  'Review the Filesystem plugin and its required-reason API declaration.',
);
const project = await read('ios/App/App.xcodeproj/project.pbxproj');
report(
  project.includes('PrivacyInfo.xcprivacy in Resources'),
  'iOS privacy manifest is in bundle resources',
  'Add PrivacyInfo.xcprivacy to the App target resource build phase.',
);
report(
  (await read('ios/App/App/AppDelegate.swift')).includes('isExcludedFromBackup = true'),
  'iOS private-directory backup exclusion request',
  'Review the native backup policy; this flag does not guarantee exclusion on every OS.',
);

for (const [file, size] of [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['resources/store-icon-512.png', 512],
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024],
]) {
  let correct = false;
  try {
    const bytes = await readFile(path.join(root, file));
    correct =
      bytes.subarray(1, 4).toString() === 'PNG' &&
      bytes.readUInt32BE(16) === size &&
      bytes.readUInt32BE(20) === size;
  } catch {
    /* Report the missing or malformed file. */
  }
  report(correct, `${size}px icon: ${file}`, 'Run npm run assets:icons.');
}

// Inspect output only for obvious credential prefixes; do not print file contents or any matches.
let secretFound = false;
async function scan(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(target);
    else if (/\.(js|json|html|map)$/.test(entry.name)) {
      const contents = await readFile(target, 'utf8');
      if (
        /sk-(?:proj-|svcacct-)[A-Za-z0-9_-]{20,}/.test(contents) ||
        /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(contents)
      )
        secretFound = true;
    }
  }
}
await scan(path.join(root, 'dist'));
report(
  !secretFound,
  'No obvious private-key material in dist',
  'Remove credentials from frontend configuration and rebuild. This check is not a full secret audit.',
);

if (release) {
  const mode = process.env.RELEASE_MODE;
  report(
    ['local', 'team'].includes(mode),
    'Distribution mode selected',
    'Set RELEASE_MODE=local or RELEASE_MODE=team.',
  );
  if (mode === 'team')
    report(
      https(process.env.RELEASE_API_URL),
      'Production API uses HTTPS',
      'Set RELEASE_API_URL to the deployed API and verify it on both native origins.',
    );
  report(
    https(process.env.RELEASE_PRIVACY_URL),
    'Public privacy policy URL',
    'Set RELEASE_PRIVACY_URL after publishing the operator-approved policy.',
  );
  report(
    https(process.env.RELEASE_SUPPORT_URL),
    'Public support URL',
    'Set RELEASE_SUPPORT_URL to the operator support page.',
  );
  report(
    /^[A-Z0-9]{10}$/.test(process.env.RELEASE_APPLE_TEAM_ID ?? ''),
    'Apple developer team identity configured',
    'Set RELEASE_APPLE_TEAM_ID; configure the matching Signing Team in Xcode.',
  );
  report(
    Boolean(process.env.RELEASE_ANDROID_KEYSTORE) &&
      (await exists(process.env.RELEASE_ANDROID_KEYSTORE ?? '')),
    'Android release keystore file is available',
    'Set RELEASE_ANDROID_KEYSTORE to the protected release keystore; configure signing in Android Studio.',
  );
}

console.log('\nManual gates still required:');
console.log('- Run native build workflows; retain their actual build logs and artifacts.');
console.log(
  '- Test camera, microphone, permission denial, playback, offline restart, storage pressure, export/share and account deletion on real iOS/Android devices.',
);
console.log(
  '- Verify HTTPS API, auth, team isolation, consent and OpenAI responses using deployment credentials.',
);
console.log(
  '- Complete signed archives, store privacy answers, operator/contact details and final review.',
);
console.log(
  '- Inspect actual native backup/restore behavior; do not promise that OS backups never include data.',
);
console.log(
  `\n${failures} source/configuration action(s). Native compilation, device tests and store approval are not certified by this script.`,
);
process.exitCode = failures ? 1 : 0;
