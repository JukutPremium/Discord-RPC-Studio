const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const root = path.join(__dirname, '..');
const out = path.join(root, 'app');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const base = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

function protect(src, dst, target) {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  const res = JavaScriptObfuscator.obfuscate(code, { ...base, target });
  fs.mkdirSync(path.dirname(path.join(out, dst)), { recursive: true });
  fs.writeFileSync(path.join(out, dst), res.getObfuscatedCode());
  console.log('  protected', src);
}

function copy(src, dst) {
  fs.cpSync(path.join(root, src), path.join(out, dst), { recursive: true });
  console.log('  copied   ', src);
}

console.log('Preparing app/ …');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

protect('main.js', 'main.js', 'node');
protect('updater.js', 'updater.js', 'node');
protect('locales.js', 'locales.js', 'node');
protect('preload.js', 'preload.js', 'browser-no-eval');
protect('renderer/renderer.js', 'renderer/renderer.js', 'browser-no-eval');
copy('renderer/index.html', 'renderer/index.html');
copy('renderer/style.css', 'renderer/style.css');
copy('assets', 'assets');

const appPkg = {
  name: pkg.name,
  productName: 'RPC Studio',
  version: pkg.version,
  description: pkg.description,
  author: pkg.author,
  license: pkg.license,
  main: 'main.js',
  releasesUrl: pkg.releasesUrl,
  dependencies: pkg.dependencies,
};
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(appPkg, null, 2));

console.log('Installing production dependencies …');
execSync('npm install --omit=dev --no-audit --no-fund --ignore-scripts', { cwd: out, stdio: 'inherit' });
console.log('Done.');
