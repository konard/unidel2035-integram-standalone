import { onMounted } from 'vue'

/**
 * Composable for managing SEO meta tags
 * @param {Object} options - SEO configuration options
 * @param {string} options.title - Page title
 * @param {string} options.description - Page description
 * @param {string} options.keywords - Page keywords
 * @param {string} options.url - Page URL
 * @param {string} options.image - Page image URL
 * @param {string} options.type - Open Graph type
 * @param {string} options.siteName - Site name
 * @param {string} options.locale - Page locale
 * @param {string} options.twitterCard - Twitter card type
 */
export function useSEO(options = {}) {
  const {
    title = '',
    description = '',
    keywords = '',
    url = '',
    image = '',
    type = 'website',
    siteName = '',
    locale = 'ru_RU',
    twitterCard = 'summary_large_image'
  } = options

  onMounted(() => {
    // Set title
    if (title) {
      document.title = title
    }

    // Helper function to set or update meta tag
    const setMetaTag = (name, content, attribute = 'name') => {
      if (!content) return

      let element = document.querySelector(`meta[${attribute}="${name}"]`)
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attribute, name)
        document.head.appendChild(element)
      }
      element.setAttribute('content', content)
    }

    // Standard meta tags
    setMetaTag('description', description)
    setMetaTag('keywords', keywords)

    // Open Graph meta tags
    setMetaTag('og:title', title, 'property')
    setMetaTag('og:description', description, 'property')
    setMetaTag('og:url', url, 'property')
    setMetaTag('og:image', image, 'property')
    setMetaTag('og:type', type, 'property')
    setMetaTag('og:site_name', siteName, 'property')
    setMetaTag('og:locale', locale, 'property')

    // Twitter meta tags
    setMetaTag('twitter:card', twitterCard)
    setMetaTag('twitter:title', title)
    setMetaTag('twitter:description', description)
    setMetaTag('twitter:image', image)
  })

  /**
   * Set structured data (JSON-LD)
   * @param {Object} data - Structured data object
   */
  const setStructuredData = (data) => {
    if (!data) return

    // Remove existing structured data script if present
    const existingScript = document.querySelector('script[type="application/ld+json"]')
    if (existingScript) {
      existingScript.remove()
    }

    // Create new structured data script
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.text = JSON.stringify(data)
    document.head.appendChild(script)
  }

  return {
    setStructuredData
  }
}
