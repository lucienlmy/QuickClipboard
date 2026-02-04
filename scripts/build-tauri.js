import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCmd, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    })

    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${args.join(' ')} failed with exit code ${code}`))
    })
  })
}

async function main() {
  const screenshotWebDir = path.join(rootDir, 'src-tauri', 'plugins', 'screenshot-suite', 'web')
  const screenshotDistDir = path.join(screenshotWebDir, 'dist')
  const hostDistDir = path.join(rootDir, 'dist')

  const isCommunity = process.env.QC_COMMUNITY === '1'
  const hasScreenshotWeb = !isCommunity && existsSync(path.join(screenshotWebDir, 'package.json'))

  if (hasScreenshotWeb) {
    const isCI = String(process.env.CI).toLowerCase() === 'true'
    const hasNodeModules = existsSync(path.join(screenshotWebDir, 'node_modules'))

    if (isCI || !hasNodeModules) {
      await run(screenshotWebDir, ['ci'])
    }
    await run(screenshotWebDir, ['run', 'build'])
    
    const srcScreenshotFrom = path.join(screenshotDistDir, 'windows', 'screenshot')
    const srcScreenshotTo = path.join(rootDir, 'src', 'windows', 'screenshot')
    
    if (existsSync(srcScreenshotFrom)) {
      await fs.mkdir(path.join(rootDir, 'src', 'windows'), { recursive: true })
      await fs.cp(srcScreenshotFrom, srcScreenshotTo, { recursive: true, force: true })
    }
  }

  await run(rootDir, ['run', 'build'])

  if (hasScreenshotWeb) {
    const from = path.join(screenshotDistDir, 'windows', 'screenshot')
    const to = path.join(hostDistDir, 'windows', 'screenshot')

    if (!existsSync(from)) {
      throw new Error(`未找到screenshot-suite Web构建输出: ${from}`)
    }

    await fs.mkdir(path.join(hostDistDir, 'windows'), { recursive: true })
    await fs.cp(from, to, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
