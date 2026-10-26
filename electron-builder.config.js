const OWNER = 'JukutPremium';
const REPO = 'Discord-RPC-Studio';

const signMac = !!(process.env.CSC_LINK || process.env.CSC_NAME);

module.exports = {
  appId: 'com.shaka.rpcstudio',
  productName: 'RPC Studio',
  copyright: 'Copyright © Shaka',
  directories: { app: 'app', output: 'dist', buildResources: 'assets' },
  asar: true,
  compression: 'maximum',
  npmRebuild: false,
  files: ['**/*', '!**/*.map', '!**/*.md', '!**/test/**'],
  afterPack: './scripts/after-pack.js',
  publish: [{ provider: 'github', owner: OWNER, repo: REPO, releaseType: 'draft' }],
  win: {
    icon: 'assets/icon.png',
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
  },
  mac: {
    icon: 'assets/icon.png',
    category: 'public.app-category.utilities',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    identity: signMac ? undefined : null,
    notarize: !!process.env.APPLE_TEAM_ID,
  },
  dmg: { title: 'RPC Studio ${version}' },
};
