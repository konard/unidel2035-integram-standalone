import { IntegramClient } from '../src/services/integram/integram-client.js'
import axios from 'axios'

// Enable axios request logging
axios.interceptors.request.use(request => {
  console.log('📤 REQUEST:', request.method.toUpperCase(), request.url)
  console.log('Headers:', request.headers)
  console.log('Data:', request.data instanceof URLSearchParams ? request.data.toString() : request.data)
  return request
})

axios.interceptors.response.use(response => {
  console.log('📥 RESPONSE:', response.status, response.statusText)
  console.log('Data:', JSON.stringify(response.data, null, 2))
  return response
}, error => {
  console.log('❌ ERROR:', error.message)
  if (error.response) {
    console.log('Response:', error.response.status, error.response.data)
  }
  return Promise.reject(error)
})

async function test() {
  const client = new IntegramClient('https://dronedoc.ru', 'my')

  console.log('=== AUTHENTICATING ===')
  await client.authenticate('d', 'd')

  // Try to get metadata for type 1
  console.log('\n=== CHECKING TYPE 1 METADATA ===')
  try {
    const type1 = await client.getTypeMetadata(1)
    console.log('Type 1 exists:', JSON.stringify(type1, null, 2))
  } catch(e) {
    console.log('Type 1 error:', e.message)
  }

  // Try to get metadata for type 3
  console.log('\n=== CHECKING TYPE 3 METADATA ===')
  try {
    const type3 = await client.getTypeMetadata(3)
    console.log('Type 3 exists:', JSON.stringify(type3, null, 2))
  } catch(e) {
    console.log('Type 3 error:', e.message)
  }

  // Check table 18 (Users)
  console.log('\n=== CHECKING TYPE 18 (Users) METADATA ===')
  try {
    const type18 = await client.getTypeMetadata(18)
    console.log('Type 18 requisites:', type18.reqs?.slice(0, 3).map(r => ({ id: r.id, alias: r.alias, typeId: r.requisite_type_id })))
  } catch(e) {
    console.log('Type 18 error:', e.message)
  }
}

test().catch(console.error)
