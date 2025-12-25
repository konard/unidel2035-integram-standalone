/**
 * Fix Messages Table - Add Room Reference Field
 * Adds a "Комната" (Room) reference field to Messages table
 */

import { IntegramClient } from '../src/services/integram/integram-client.js'

async function fixMessagesTable() {
  console.log('[Fix Messages] Starting...')

  const client = new IntegramClient(process.env.INTEGRAM_SERVER_URL || 'https://example.integram.io', 'my')

  // Authenticate
  await client.authenticate('d', 'd')
  console.log('[Fix Messages] ✅ Authenticated')

  try {
    const MESSAGES_TABLE = 217742
    const CHAT_ROOMS_TABLE = 217735

    // Step 1: Add requisite with type 3 (SHORT) - since type 8 doesn't work in "my" DB
    console.log('[Fix Messages] Step 1: Adding SHORT requisite...')
    const addReqResult = await client.addRequisite(MESSAGES_TABLE, 3) // 3 = SHORT
    console.log('[Fix Messages] Add requisite result:', addReqResult)

    const requisiteId = addReqResult.id || addReqResult.ID
    if (!requisiteId) {
      throw new Error('Failed to create requisite - no ID returned')
    }

    console.log('[Fix Messages] ✅ Requisite created:', requisiteId)

    // Step 2: Set reference to Chat Rooms table
    console.log('[Fix Messages] Step 2: Setting reference target...')
    await client.setRequisiteReference(requisiteId, CHAT_ROOMS_TABLE)
    console.log('[Fix Messages] ✅ Reference set to table', CHAT_ROOMS_TABLE)

    // Step 3: Set alias
    console.log('[Fix Messages] Step 3: Setting alias...')
    await client.saveRequisiteAlias(requisiteId, 'Комната')
    console.log('[Fix Messages] ✅ Alias set to "Комната"')

    // Step 4: Make it required (toggle null - default is nullable, toggle makes it NOT NULL)
    console.log('[Fix Messages] Step 4: Making field required...')
    await client.toggleRequisiteNull(requisiteId)
    console.log('[Fix Messages] ✅ Field is now required')

    // Update CHAT_TABLES config
    console.log('\n[Fix Messages] UPDATE CHAT_TABLES.MESSAGES.REQUISITES:')
    console.log(`ROOM_REF: ${requisiteId},           // Комната → Чат-румы (обязательное)`)

    return { id: requisiteId, alias: 'Комната', referenceTableId: CHAT_ROOMS_TABLE }
  } catch (error) {
    console.error('[Fix Messages] ❌ Error:', error.message)
    throw error
  }
}

fixMessagesTable()
  .then(() => {
    console.log('\n[Fix Messages] ✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n[Fix Messages] ❌ Failed:', error)
    process.exit(1)
  })
