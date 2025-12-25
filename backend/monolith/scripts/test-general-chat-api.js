/**
 * Test script for General Chat API
 * Tests all REST API endpoints for general chat functionality
 */

import axios from 'axios'

const API_URL = process.env.API_URL || 'http://localhost:8082'
const API_BASE = `${API_URL}/api/general-chat`

// Test data
let testRoomId = null
let testMessageId = null
let testMemberId = null
const testUserId = 1 // Using hardcoded user ID for testing

async function testCreateRoom() {
  console.log('\n=== Test 1: Create Chat Room ===')
  try {
    const response = await axios.post(`${API_BASE}/rooms`, {
      name: 'Test Chat Room',
      description: 'Testing general chat API',
      typeId: 217733 // Group chat
    }, {
      headers: {
        'Cookie': 'userId=1' // Mock session for testing
      }
    })

    testRoomId = response.data.data.id
    console.log('✅ Chat room created:', response.data.data)
    return true
  } catch (error) {
    console.error('❌ Failed to create room:', error.response?.data || error.message)
    return false
  }
}

async function testGetRooms() {
  console.log('\n=== Test 2: Get All Rooms ===')
  try {
    const response = await axios.get(`${API_BASE}/rooms?limit=10`)
    console.log(`✅ Found ${response.data.total} rooms:`)
    response.data.data.slice(0, 3).forEach(room => {
      console.log(`   - ${room.name} (ID: ${room.id})`)
    })
    return true
  } catch (error) {
    console.error('❌ Failed to get rooms:', error.response?.data || error.message)
    return false
  }
}

async function testGetRoom() {
  console.log('\n=== Test 3: Get Room by ID ===')
  try {
    const response = await axios.get(`${API_BASE}/rooms/${testRoomId}`)
    console.log('✅ Room details:', response.data.data)
    return true
  } catch (error) {
    console.error('❌ Failed to get room:', error.response?.data || error.message)
    return false
  }
}

async function testAddMember() {
  console.log('\n=== Test 4: Add Member to Room ===')
  try {
    const response = await axios.post(`${API_BASE}/rooms/${testRoomId}/members`, {
      userId: testUserId,
      role: 'member'
    })

    testMemberId = response.data.data.id
    console.log('✅ Member added:', response.data.data)
    return true
  } catch (error) {
    console.error('❌ Failed to add member:', error.response?.data || error.message)
    return false
  }
}

async function testGetMembers() {
  console.log('\n=== Test 5: Get Room Members ===')
  try {
    const response = await axios.get(`${API_BASE}/rooms/${testRoomId}/members`)
    console.log(`✅ Found ${response.data.total} members:`)
    response.data.data.forEach(member => {
      console.log(`   - User ${member.userId} (${member.role})`)
    })
    return true
  } catch (error) {
    console.error('❌ Failed to get members:', error.response?.data || error.message)
    return false
  }
}

async function testSendMessage() {
  console.log('\n=== Test 6: Send Message ===')
  try {
    const response = await axios.post(`${API_BASE}/rooms/${testRoomId}/messages`, {
      text: 'Hello from test script! 👋'
    }, {
      headers: {
        'Cookie': 'userId=1' // Mock session
      }
    })

    testMessageId = response.data.data.id
    console.log('✅ Message sent:', response.data.data)
    return true
  } catch (error) {
    console.error('❌ Failed to send message:', error.response?.data || error.message)
    return false
  }
}

async function testGetMessages() {
  console.log('\n=== Test 7: Get Messages ===')
  try {
    const response = await axios.get(`${API_BASE}/rooms/${testRoomId}/messages?limit=10`)
    console.log(`✅ Found ${response.data.total} messages:`)
    response.data.data.slice(0, 3).forEach(msg => {
      console.log(`   - "${msg.text}" (ID: ${msg.id})`)
    })
    return true
  } catch (error) {
    console.error('❌ Failed to get messages:', error.response?.data || error.message)
    return false
  }
}

async function testUpdateMessage() {
  console.log('\n=== Test 8: Update Message ===')
  try {
    const response = await axios.put(`${API_BASE}/messages/${testMessageId}`, {
      text: 'Updated message text! ✏️'
    })
    console.log('✅ Message updated:', response.data.data)
    return true
  } catch (error) {
    console.error('❌ Failed to update message:', error.response?.data || error.message)
    return false
  }
}

async function testUpdateLastRead() {
  console.log('\n=== Test 9: Update Last Read ===')
  try {
    const response = await axios.put(`${API_BASE}/members/${testMemberId}/read`)
    console.log('✅ Last read updated:', response.data.message)
    return true
  } catch (error) {
    console.error('❌ Failed to update last read:', error.response?.data || error.message)
    return false
  }
}

async function testDeleteMessage() {
  console.log('\n=== Test 10: Delete Message (soft) ===')
  try {
    const response = await axios.delete(`${API_BASE}/messages/${testMessageId}`)
    console.log('✅ Message deleted:', response.data.message)
    return true
  } catch (error) {
    console.error('❌ Failed to delete message:', error.response?.data || error.message)
    return false
  }
}

async function runTests() {
  console.log('🚀 Starting General Chat API Tests')
  console.log(`   API URL: ${API_BASE}`)
  console.log('=' .repeat(60))

  const results = []

  // Run tests sequentially
  results.push(await testCreateRoom())
  if (!testRoomId) {
    console.error('\n❌ Cannot continue without room ID')
    return
  }

  results.push(await testGetRooms())
  results.push(await testGetRoom())
  results.push(await testAddMember())
  results.push(await testGetMembers())
  results.push(await testSendMessage())
  results.push(await testGetMessages())
  results.push(await testUpdateMessage())
  results.push(await testUpdateLastRead())
  results.push(await testDeleteMessage())

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Results Summary')
  console.log('='.repeat(60))
  const passed = results.filter(r => r === true).length
  const failed = results.filter(r => r === false).length
  console.log(`   ✅ Passed: ${passed}/${results.length}`)
  console.log(`   ❌ Failed: ${failed}/${results.length}`)

  if (failed === 0) {
    console.log('\n🎉 All tests passed!')
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above.')
  }
}

runTests().catch(console.error)
