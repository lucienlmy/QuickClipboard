#!/usr/bin/env node
// 社区版编译脚本 - 使用 --no-default-features 排除私有插件
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const isDev = process.argv.includes('--dev');
const isCommunity = process.argv.includes('--no-default-features') || !process.argv.includes('--full');
const command = isDev ? 'dev' : 'build';

const args = ['run', 'tauri', '--', command];
if (isCommunity) {
    args.push('--', '--no-default-features');
}

const edition = isCommunity ? '社区版' : '完整版';
console.log(`[build] 版本: ${edition}`);
console.log(`[build] 模式: ${isDev ? '开发' : '生产'}`);
console.log(`[build] 执行: npm ${args.join(' ')}`);

const child = spawn('npm', args, { 
    stdio: 'inherit', 
    cwd: rootDir,
    shell: true
});

child.on('error', (err) => {
    console.error(`[build] 启动失败: ${err.message}`);
    process.exit(1);
});

child.on('close', (code) => {
    if (code !== 0) {
        console.error(`[build] 编译失败，退出码: ${code}`);
    } else {
        console.log(`[build] ${edition}编译完成`);
    }
    process.exit(code);
});
