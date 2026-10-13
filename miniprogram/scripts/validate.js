const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const skipped = new Set(['node_modules', 'miniprogram_npm']);

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, callback);
    else callback(fullPath);
  }
}

const errors = [];
const { APP_VERSION } = require(path.join(root, 'utils/config'));
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
let updateList = [];
const updatePath = path.join(root, 'pages/update-log/update-log.js');
vm.runInNewContext(fs.readFileSync(updatePath, 'utf8'), {
  Page(page) { updateList = page.data.updateList; },
  require: createRequire(updatePath)
}, { filename: updatePath });
if (!/^\d+\.\d+\.\d+$/.test(APP_VERSION) ||
    [packageInfo.version, packageLock.version, packageLock.packages[''].version, updateList[0]?.version].some(version => version !== APP_VERSION)) {
  errors.push('运行配置、包配置和最新更新记录的版本号不一致');
}
if (!fs.readFileSync(path.join(root, 'pages/profile/profile.wxml'), 'utf8').includes('当前版本 v{{appVersion}}')) {
  errors.push('个人页应读取统一配置中的版本号');
}
walk(root, (filePath) => {
  try {
    if (filePath.endsWith('.js')) {
      new vm.Script(fs.readFileSync(filePath, 'utf8'), { filename: filePath });
    } else if (filePath.endsWith('.json')) {
      JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    errors.push(error.message);
  }
});

const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
for (const page of appConfig.pages) {
  for (const extension of ['.js', '.wxml', '.wxss']) {
    const pageFile = path.join(root, `${page}${extension}`);
    if (!fs.existsSync(pageFile)) errors.push(`缺少页面文件: ${pageFile}`);
  }
}

const { parseRedemptionQrResult } = require(path.join(root, 'utils/redemption-qr'));
const sampleToken = 'AbCdEfGhIjKlMnOpQrStUvWxYz_12345';
if (parseRedemptionQrResult(`BBCH-REDEEM:1:${sampleToken}`) !== sampleToken) {
  errors.push('动态核销二维码解析失败');
}
if (parseRedemptionQrResult('BBCH-1234-5678') || parseRedemptionQrResult('https://example.com')) {
  errors.push('动态核销二维码接受了无效内容');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('小程序 JS、JSON 与页面注册检查通过');
