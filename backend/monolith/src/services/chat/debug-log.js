import fs from 'fs'

export function debugLog(message) {
  const timestamp = new Date().toISOString()
  fs.appendFileSync('/tmp/chat-debug.log', `${timestamp} - ${message}\n`)
}
