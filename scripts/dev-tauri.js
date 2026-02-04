import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const isWin = process.platform === 'win32'

function run(cwd, commandLine) {
  const child = isWin
    ? spawn('cmd.exe', ['/d', '/s', '/c', commandLine], {
        cwd,
        stdio: 'inherit',
        env: process.env,
      })
    : spawn('sh', ['-lc', commandLine], {
        cwd,
        stdio: 'inherit',
        env: process.env,
      })

  child.on('error', (err) => {
    console.error(err)
    process.exit(1)
  })

  child.on('exit', (code) => {
    if (code && code !== 0) {
      process.exit(code)
    }
  })

  return child
}

function runAsync(cwd, commandLine) {
  return new Promise((resolve, reject) => {
    const child = isWin
      ? spawn('cmd.exe', ['/d', '/s', '/c', commandLine], {
          cwd,
          stdio: 'inherit',
          env: process.env,
        })
      : spawn('sh', ['-lc', commandLine], {
          cwd,
          stdio: 'inherit',
          env: process.env,
        })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${commandLine} failed with exit code ${code}`))
    })
  })
}

let host = null
let screenshot = null
const screenshotWebDir = path.join(rootDir, 'src-tauri', 'plugins', 'screenshot-suite', 'web')

async function main() {
  host = run(rootDir, 'npm run dev')

  if (existsSync(path.join(screenshotWebDir, 'package.json'))) {
    if (!existsSync(path.join(screenshotWebDir, 'node_modules'))) {
      await runAsync(screenshotWebDir, 'npm ci')
    }
    screenshot = run(screenshotWebDir, 'npm run dev')
  }
}

function shutdown() {
  host?.kill()
  screenshot?.kill()
}

process.on('SIGINT', () => {
  shutdown()
  process.exit(0)
})
process.on('SIGTERM', () => {
  shutdown()
  process.exit(0)
})

main().catch((err) => {
  console.error(err)
  shutdown()
  process.exit(1)
})
