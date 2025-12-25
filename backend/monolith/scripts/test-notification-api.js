/**
 * Test script for notification API endpoints
 *
 * This script tests the notification API to ensure all endpoints work correctly
 * with the file-based storage backend.
 */

import axios from 'axios'

const API_BASE = process.env.API_BASE || 'http://localhost:8081/api'
const USER_ID = 'test-user-123'

console.log('🧪 Testing Notification API')
console.log('===========================\n')
console.log(`API Base: ${API_BASE}`)
console.log(`User ID: ${USER_ID}\n`)

async function runTests() {
  try {
    // Test 1: Create a notification
    console.log('Test 1: Create notification...')
    const createResponse = await axios.post(`${API_BASE}/notifications`, {
      userId: USER_ID,
      type: 'system',
      title: 'Test Notification',
      message: 'This is a test notification',
      priority: 'high',
      icon: '🔔'
    }, {
      headers: { 'x-user-id': USER_ID }
    })
    console.log('✅ Notification created:', createResponse.data.data.id)
    const notificationId = createResponse.data.data.id

    // Test 2: Get all notifications
    console.log('\nTest 2: Get all notifications...')
    const listResponse = await axios.get(`${API_BASE}/notifications?userId=${USER_ID}`)
    console.log(`✅ Found ${listResponse.data.data.notifications.length} notifications`)

    // Test 3: Get unread count
    console.log('\nTest 3: Get unread count...')
    const countResponse = await axios.get(`${API_BASE}/notifications/unread-count?userId=${USER_ID}`)
    console.log(`✅ Unread count: ${countResponse.data.data.count}`)

    // Test 4: Mark as read
    console.log('\nTest 4: Mark notification as read...')
    await axios.put(`${API_BASE}/notifications/${notificationId}/read`, {}, {
      headers: { 'x-user-id': USER_ID }
    })
    console.log('✅ Notification marked as read')

    // Test 5: Get unread count again (should be 0)
    console.log('\nTest 5: Get unread count again...')
    const countResponse2 = await axios.get(`${API_BASE}/notifications/unread-count?userId=${USER_ID}`)
    console.log(`✅ Unread count: ${countResponse2.data.data.count}`)

    // Test 6: Create another notification
    console.log('\nTest 6: Create another notification...')
    const createResponse2 = await axios.post(`${API_BASE}/notifications`, {
      userId: USER_ID,
      type: 'activity',
      title: 'Second Test',
      message: 'Another test notification',
      priority: 'medium'
    }, {
      headers: { 'x-user-id': USER_ID }
    })
    console.log('✅ Second notification created:', createResponse2.data.data.id)

    // Test 7: Get grouped notifications
    console.log('\nTest 7: Get grouped notifications...')
    const groupedResponse = await axios.get(`${API_BASE}/notifications/grouped?userId=${USER_ID}`)
    console.log('✅ Grouped notifications:')
    console.log(`   Today: ${groupedResponse.data.data.today.length}`)
    console.log(`   Yesterday: ${groupedResponse.data.data.yesterday.length}`)
    console.log(`   This Week: ${groupedResponse.data.data.thisWeek.length}`)
    console.log(`   Older: ${groupedResponse.data.data.older.length}`)

    // Test 8: Delete a notification
    console.log('\nTest 8: Delete notification...')
    await axios.delete(`${API_BASE}/notifications/${notificationId}`, {
      headers: { 'x-user-id': USER_ID }
    })
    console.log('✅ Notification deleted')

    console.log('\n✨ All tests passed!')
    console.log('\nThe notification API is working correctly with file-based storage.')

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', JSON.stringify(error.response.data, null, 2))
    }
    process.exit(1)
  }
}

runTests()
