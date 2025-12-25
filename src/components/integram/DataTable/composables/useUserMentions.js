import { ref, computed } from 'vue'
import integramApiClient from '@/services/integramApiClient'

// Column name patterns (case-insensitive)
// Note: patterns can match ANY substring, so "photo" will match "photograph", "фото" will match any Russian photo variant
const PHOTO_COLUMNS = [
  'photo', 'изображение', 'фото', 'картинка', 'аватара', 'picture',
  'avatar', 'img', 'image', 'пиеср', 'аватар'
]
const NAME_COLUMNS = [
  'имя', 'name', 'login', 'username', 'фио', 'полное_имя', 'полное имя',
  'полное_название', 'полное название', 'displayname'
]

// Module-level cache: { database: { users, loading, promise } }
const usersCache = new Map()

/**
 * Composable for handling user mentions in Integram cells
 * Allows typing @ to mention users from table 18 (always from "my" database)
 *
 * IMPORTANT: Uses module-level cache to prevent duplicate API requests
 * Users are ALWAYS loaded from "my" database, regardless of current database
 */
export function useUserMentions(database) {
  // ALWAYS use "my" database for users, regardless of current database
  const usersDatabase = 'my'

  // Get or create cache entry for users database
  if (!usersCache.has(usersDatabase)) {
    usersCache.set(usersDatabase, {
      users: ref([]),
      loading: ref(false),
      loadPromise: null
    })
  }

  const cache = usersCache.get(usersDatabase)
  const users = cache.users
  const loading = cache.loading

  /**
   * Load users from table 18 of "my" database
   * Uses cache to prevent duplicate requests
   * Always loads for @mentions feature to work properly
   */
  async function loadUsers() {
    // Return existing promise if load is in progress
    if (cache.loadPromise) {
      return cache.loadPromise
    }

    // Return cached data if already loaded
    if (users.value.length > 0) {
      return
    }

    // Create and store the loading promise
    cache.loadPromise = (async () => {
      loading.value = true
      let originalDatabase = null

      try {
        // IMPORTANT: Save current database context
        originalDatabase = integramApiClient.currentDatabase

        // Switch to "my" database to load users
        integramApiClient.setDatabase('my')

        // Get table 18 metadata to find photo and name columns
        const metadata = await integramApiClient.getTypeMetadata(18)

        console.log('[useUserMentions] Table 18 full metadata:', metadata)

        // Extract reqs array from metadata
        const requisites = metadata?.reqs || []
        console.log('[useUserMentions] Total requisites:', requisites.length)
        console.log('[useUserMentions] First 5 requisites:', requisites.slice(0, 5).map(r => ({
          id: r.id,
          alias: r.alias,
          val: r.val,
          requisite_type_id: r.requisite_type_id
        })))

        // Debug: log all requisite names for manual inspection
        console.log('[useUserMentions] All column names (alias || val):')
        requisites.forEach((r, idx) => {
          const name = r.alias || r.val
          console.log(`  [${idx}] id=${r.id}, name="${name}"`)
        })

        // Find photo column by matching against PHOTO_COLUMNS patterns
        const photoColumn = requisites.find(req => {
          const name = (req.alias || req.val || '').toLowerCase()
          return PHOTO_COLUMNS.some(pattern => name.includes(pattern))
        })

        // Find name column by matching against NAME_COLUMNS patterns
        let nameColumn = requisites.find(req => {
          const name = (req.alias || req.val || '').toLowerCase()
          return NAME_COLUMNS.some(pattern => name.includes(pattern))
        })

        // Fallback: if no name column found, use second requisite (usually the name)
        if (!nameColumn && requisites.length > 1) {
          nameColumn = requisites[1]
          console.log('[useUserMentions] No name column matched pattern, using requisite[1] as fallback')
        }

        // Fallback: if no photo column found, try third requisite (often photo/avatar)
        if (!photoColumn && requisites.length > 2) {
          photoColumn = requisites[2]
          console.log('[useUserMentions] No photo column matched pattern, using requisite[2] as fallback')
        }

        console.log('[useUserMentions] Found columns:', {
          nameColumn: nameColumn ? { id: nameColumn.id, alias: nameColumn.alias, val: nameColumn.val } : 'NOT FOUND',
          photoColumn: photoColumn ? { id: photoColumn.id, alias: photoColumn.alias, val: photoColumn.val } : 'NOT FOUND'
        })

        // Get all users from table 18 from "my" database
        // IMPORTANT: Use getAllObjects instead of getObjectList for proper pagination
        // getObjectList with offset/limit is limited to 20 objects per request by Integram API
        // getAllObjects uses pg/LIMIT pagination which supports full datasets
        console.log('[useUserMentions] Loading users from table 18 (my database)...')
        const response = await integramApiClient.getAllObjects(18, 100, 50)
        console.log('[useUserMentions] Got response:', {
          objectCount: response.object?.length || 0,
          totalCount: response.totalCount || 0,
          pagesLoaded: response.pagesLoaded || 0,
          hasReqs: !!response.reqs,
          responseKeys: Object.keys(response)
        })

        // Parse users
        let loggedUsers = 0
        users.value = response.object.map(obj => {
          const userId = obj.id || obj.ID
          const userReqs = response.reqs?.[userId]
          const shouldLog = loggedUsers < 3

          let userName = userId
          let userPhoto = null

          if (userReqs) {
            // Try to get name from column
            if (nameColumn) {
              const nameValue = userReqs[nameColumn.id]
              if (nameValue) {
                userName = nameValue
                if (shouldLog) console.log(`[useUserMentions] User ${userId}: name from column ${nameColumn.id} = "${nameValue}"`)
              }
            }

            // Try to get photo from column
            if (photoColumn) {
              const photoValue = userReqs[photoColumn.id]
              if (photoValue) {
                let extractedUrl = null

                // If photo value is an HTML link like <a href='url'>text</a>, extract the URL
                if (typeof photoValue === 'string' && photoValue.includes('href')) {
                  const urlMatch = photoValue.match(/href=['"]([^'"]+)['"]/)
                  if (urlMatch) {
                    extractedUrl = urlMatch[1]
                  }
                } else if (typeof photoValue === 'string') {
                  // Direct URL path
                  extractedUrl = photoValue
                }

                // Convert relative paths to absolute URLs
                if (extractedUrl) {
                  if (extractedUrl.startsWith('http://') || extractedUrl.startsWith('https://')) {
                    // Already absolute URL
                    userPhoto = extractedUrl
                  } else if (extractedUrl.startsWith('/')) {
                    // Relative path, add domain
                    userPhoto = `https://dronedoc.ru${extractedUrl}`
                  } else {
                    // Just a path without leading slash, assume it needs one
                    userPhoto = `https://dronedoc.ru/${extractedUrl}`
                  }

                  if (shouldLog) console.log(`[useUserMentions] User ${userId}: photo URL = "${userPhoto}"`)
                }
              }
            }
          }

          if (shouldLog) loggedUsers++

          return {
            id: userId,
            name: userName,
            photo: userPhoto,
            // Mention format: @my_{userId} (always from "my" database)
            mention: `@my_${userId}`
          }
        })
        console.log('[useUserMentions] Successfully loaded', users.value.length, 'users from "my" database (total from response:', response.totalCount, ')')
        console.log('[useUserMentions] Sample users with photos:', users.value.slice(0, 5).map(u => ({
          id: u.id,
          name: u.name,
          photo: u.photo ? `[photo present, length=${u.photo.length}]` : '[no photo]',
          mention: u.mention
        })))
      } catch (error) {
        console.error('[useUserMentions] Failed to load users from "my" database:', error)
        users.value = []
      } finally {
        loading.value = false

        // Restore original database context
        if (originalDatabase) {
          integramApiClient.setDatabase(originalDatabase)
        }

        cache.loadPromise = null // Clear promise when done
      }
    })()

    return cache.loadPromise
  }

  /**
   * Filter users by search query
   */
  function filterUsers(query) {
    if (!query) return users.value

    const search = query.toLowerCase()
    return users.value.filter(user =>
      user.name.toLowerCase().includes(search) ||
      user.id.toString().includes(search)
    )
  }

  /**
   * Parse text and extract mentions
   * Format: @{database}_{userId}
   */
  function parseMentions(text) {
    if (!text) return []

    const mentionRegex = /@(\w+)_(\d+)/g
    const mentions = []
    let match

    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push({
        full: match[0],          // @my_156
        database: match[1],      // my
        userId: match[2],        // 156
        startIndex: match.index,
        endIndex: match.index + match[0].length
      })
    }

    return mentions
  }

  /**
   * Get user by ID
   */
  function getUserById(userId) {
    return users.value.find(u => u.id === userId)
  }

  /**
   * Replace mentions in text with rich display
   * Returns array of segments: { type: 'text'|'mention', content, user? }
   */
  function renderMentions(text) {
    if (!text) return [{ type: 'text', content: '' }]

    const mentions = parseMentions(text)
    if (mentions.length === 0) {
      return [{ type: 'text', content: text }]
    }

    const segments = []
    let lastIndex = 0

    mentions.forEach(mention => {
      // Add text before mention
      if (mention.startIndex > lastIndex) {
        segments.push({
          type: 'text',
          content: text.substring(lastIndex, mention.startIndex)
        })
      }

      // Add mention
      const user = getUserById(mention.userId)
      segments.push({
        type: 'mention',
        content: mention.full,
        user: user || {
          id: mention.userId,
          name: mention.userId,
          photo: null
        }
      })

      lastIndex = mention.endIndex
    })

    // Add remaining text
    if (lastIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex)
      })
    }

    return segments
  }

  /**
   * Insert mention at cursor position
   */
  function insertMention(text, cursorPosition, user) {
    const before = text.substring(0, cursorPosition)
    const after = text.substring(cursorPosition)

    // Remove @ if it's already there
    const beforeWithoutAt = before.endsWith('@') ? before.slice(0, -1) : before

    return {
      text: beforeWithoutAt + user.mention + ' ' + after,
      cursorPosition: beforeWithoutAt.length + user.mention.length + 1
    }
  }

  return {
    users,
    loading,
    loadUsers,
    filterUsers,
    parseMentions,
    getUserById,
    renderMentions,
    insertMention
  }
}
