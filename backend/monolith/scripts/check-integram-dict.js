import { IntegramClient } from '../src/services/integram/integram-client.js'

async function check() {
  const client = new IntegramClient(process.env.INTEGRAM_SERVER_URL || 'https://example.integram.io', 'my')
  await client.authenticate('d', 'd')

  const dict = await client.getDictionary()
  console.log('Словарь базы my:')
  console.log(JSON.stringify(dict, null, 2))
}

check().catch(console.error)
