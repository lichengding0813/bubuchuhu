const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('小程序 JS、JSON 与页面注册检查通过');
