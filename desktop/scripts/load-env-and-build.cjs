// Load .env file and run electron-builder
require('dotenv').config({ path: '.env' })

const { spawn } = require('child_process')
const path = require('path')

// Get platform argument (--win, --mac, --linux)
const platformArg = process.argv.find(arg => ['--win', '--mac', '--linux'].includes(arg)) || ''

// Build electron-builder command
const args = []
if (platformArg) {
  args.push(platformArg)
}
args.push('--publish', 'always')

// Check if GH_TOKEN is set
if (!process.env.GH_TOKEN) {
  console.error('❌ Error: GH_TOKEN not found in .env file or environment variables')
  console.error('Please create a .env file in the desktop/ directory with:')
  console.error('GH_TOKEN=your_token_here')
  process.exit(1)
}

console.log('✅ GH_TOKEN loaded from .env')
console.log(`Running: electron-builder ${args.join(' ')}`)

// Run electron-builder
const electronBuilder = spawn('npx', ['electron-builder', ...args], {
  stdio: 'inherit',
  shell: true,
  cwd: path.resolve(__dirname, '..')
})

electronBuilder.on('close', (code) => {
  process.exit(code)
})

electronBuilder.on('error', (error) => {
  console.error('Failed to start electron-builder:', error)
  process.exit(1)
})
