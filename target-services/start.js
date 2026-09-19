const { spawn } = require('child_process')
const path = require('path')

const services = [
  { name: 'db-service', script: 'db-service/index.js', port: 8084 },
  { name: 'payment', script: 'payment/index.js', port: 8083 },
  { name: 'inventory', script: 'inventory/index.js', port: 8082 },
  { name: 'orders', script: 'orders/index.js', port: 8081 },
  { name: 'gateway', script: 'gateway/index.js', port: 8080 },
]

const children = []

console.log('Starting all 5 target microservices on localhost...')

services.forEach(({ name, script, port }) => {
  const child = spawn('node', [script], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, PORT: port }
  })
  children.push(child)
})

function cleanup() {
  console.log('\nShutting down all target microservices...')
  children.forEach(c => c.kill('SIGINT'))
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
