const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function afterPack(ctx) {
  const name = ctx.packager.appInfo.productFilename;
  const platform = ctx.electronPlatformName;
  const bin =
    platform === 'darwin' ? path.join(ctx.appOutDir, `${name}.app`)
    : platform === 'win32' ? path.join(ctx.appOutDir, `${name}.exe`)
    : path.join(ctx.appOutDir, ctx.packager.executableName);

  await flipFuses(bin, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: platform === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
};
