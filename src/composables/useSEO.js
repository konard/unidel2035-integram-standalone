/**
 * SEO Composable for Dynamic Meta Tag Management
 *
 * This composable provides utilities for managing SEO meta tags dynamically
 * across different pages in the DronDoc application.
 *
 * @module useSEO
 * @see https://github.com/unidel2035/dronedoc2025/issues/79
 */

import { onMounted, onUnmounted } from 'vue'

/**
 * Default SEO configuration
 */
const DEFAULT_SEO = {
  title: 'ДронДок - Универсальная платформа-конструктор приложений',
  description: 'Универсальная платформа-конструктор для создания приложений с ИИ-памятью, визуальным редактором и модульной архитектурой. От корпоративных систем до управления дронами.',
  keywords: 'конструктор приложений, ИИ-память, no-code, визуальный редактор, дроны, БПЛА, беспилотники, планирование полетов, компьютерное зрение, российское ПО, модульная платформа, управление дронами, навигация, тактическая карта',
  image: 'https://dronedoc.ru/meta/og.png',
  url: 'https://dronedoc.ru/',
  type: 'website',
  siteName: 'ДронДок',
  locale: 'ru_RU',
  twitterCard: 'summary_large_image',
}

/**
 * Set a meta tag value
 * @param {string} name - The name or property of the meta tag
 * @param {string} content - The content value
 * @param {string} attrName - The attribute name ('name', 'property', 'itemprop')
 */
function setMetaTag(name, content, attrName = 'name') {
  if (!content) return

  let element = document.querySelector(`meta[${attrName}="${name}"]`)

  if (element) {
    element.setAttribute('content', content)
  } else {
    element = document.createElement('meta')
    element.setAttribute(attrName, name)
    element.setAttribute('content', content)
    document.head.appendChild(element)
  }
}

/**
 * Set the page title
 * @param {string} title - The page title
 */
function setTitle(title) {
  if (title) {
    document.title = `${title} | DronDoc`
  }
}

/**
 * Set canonical URL
 * @param {string} url - The canonical URL
 */
function setCanonical(url) {
  if (!url) return

  let element = document.querySelector('link[rel="canonical"]')

  if (element) {
    element.setAttribute('href', url)
  } else {
    element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    element.setAttribute('href', url)
    document.head.appendChild(element)
  }
}

/**
 * Add structured data (JSON-LD)
 * @param {object} data - The structured data object
 * @param {string} id - Optional ID for the script tag
 */
function setStructuredData(data, id = 'structured-data') {
  // Remove existing structured data with the same ID
  const existing = document.getElementById(id)
  if (existing) {
    existing.remove()
  }

  const script = document.createElement('script')
  script.id = id
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify(data)
  document.head.appendChild(script)
}

/**
 * Main composable function for SEO management
 * @param {object} options - SEO configuration options
 * @returns {object} SEO utility functions
 */
export function useSEO(options = {}) {
  const seoConfig = { ...DEFAULT_SEO, ...options }

  /**
   * Update all SEO meta tags based on configuration
   */
  const updateSEO = () => {
    // Title
    setTitle(seoConfig.title)

    // Primary meta tags
    setMetaTag('title', seoConfig.title)
    setMetaTag('description', seoConfig.description)
    setMetaTag('keywords', seoConfig.keywords)

    // Canonical URL
    setCanonical(seoConfig.url)

    // Open Graph tags
    setMetaTag('og:type', seoConfig.type, 'property')
    setMetaTag('og:url', seoConfig.url, 'property')
    setMetaTag('og:title', seoConfig.title, 'property')
    setMetaTag('og:description', seoConfig.description, 'property')
    setMetaTag('og:image', seoConfig.image, 'property')
    setMetaTag('og:site_name', seoConfig.siteName, 'property')
    setMetaTag('og:locale', seoConfig.locale, 'property')

    // Twitter Card tags
    setMetaTag('twitter:card', seoConfig.twitterCard, 'property')
    setMetaTag('twitter:url', seoConfig.url, 'property')
    setMetaTag('twitter:title', seoConfig.title, 'property')
    setMetaTag('twitter:description', seoConfig.description, 'property')
    setMetaTag('twitter:image', seoConfig.image, 'property')

    // VK and other social media
    setMetaTag('vk:image', seoConfig.image, 'property')
    setMetaTag('image', seoConfig.image, 'itemprop')

    // Structured data if provided
    if (seoConfig.structuredData) {
      setStructuredData(seoConfig.structuredData, seoConfig.structuredDataId || 'structured-data')
    }
  }

  // Update SEO on mount
  onMounted(() => {
    updateSEO()
  })

  // Cleanup on unmount (optional - restore defaults)
  onUnmounted(() => {
    // Could restore default SEO here if needed
  })

  return {
    updateSEO,
    setTitle,
    setMetaTag,
    setCanonical,
    setStructuredData,
  }
}

/**
 * Pre-defined SEO configurations for common page types
 */
export const SEO_PRESETS = {
  docs: {
    type: 'article',
    image: 'https://dronedoc.ru/meta/og.png',
  },

  landing: {
    type: 'website',
    image: 'https://dronedoc.ru/meta/og.png',
  },

  product: {
    type: 'product',
    image: 'https://dronedoc.ru/meta/og.png',
  },

  video: {
    type: 'video.other',
    twitterCard: 'player',
  },
}

/**
 * Generate structured data for Organization
 * @returns {object} Organization structured data
 */
export function getOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': 'ДронДок',
    'url': 'https://dronedoc.ru/',
    'logo': 'https://dronedoc.ru/meta/icon.svg',
    'description': 'Первая российская программная платформа-конструктор для операторов беспилотных авиационных систем',
    'sameAs': [
      // Add social media profiles here when available
    ],
  }
}

/**
 * Generate structured data for Breadcrumbs
 * @param {Array} items - Breadcrumb items [{name, url}, ...]
 * @returns {object} BreadcrumbList structured data
 */
export function getBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((item, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': item.name,
      'item': item.url,
    })),
  }
}

/**
 * Generate structured data for Article
 * @param {object} article - Article data
 * @returns {object} Article structured data
 */
export function getArticleSchema(article) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': article.title,
    'description': article.description,
    'image': article.image || DEFAULT_SEO.image,
    'author': {
      '@type': 'Organization',
      'name': 'ДронДок',
    },
    'publisher': {
      '@type': 'Organization',
      'name': 'ДронДок',
      'logo': {
        '@type': 'ImageObject',
        'url': 'https://dronedoc.ru/meta/icon.svg',
      },
    },
    'datePublished': article.publishedDate,
    'dateModified': article.modifiedDate || article.publishedDate,
  }
}

/**
 * Generate structured data for FAQ
 * @param {Array} faqs - FAQ items [{question, answer}, ...]
 * @returns {object} FAQPage structured data
 */
export function getFAQSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqs.map(faq => ({
      '@type': 'Question',
      'name': faq.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': faq.answer,
      },
    })),
  }
}

/**
 * Generate structured data for SoftwareApplication (Agent/Tool)
 * @param {object} agent - Agent data
 * @returns {object} SoftwareApplication structured data
 */
export function getSoftwareApplicationSchema(agent) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': agent.name,
    'description': agent.description,
    'applicationCategory': 'BusinessApplication',
    'operatingSystem': 'Web',
    'url': `https://dronedoc.ru/spaces#${agent.id || agent.slug}`,
  }

  // Add offers if price is available
  if (agent.price !== undefined && agent.price !== null) {
    schema.offers = {
      '@type': 'Offer',
      'price': agent.price.toString(),
      'priceCurrency': 'RUB',
    }
  }

  // Add aggregate rating if available
  if (agent.rating && agent.reviewCount) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': agent.rating.toString(),
      'reviewCount': agent.reviewCount.toString(),
    }
  }

  // Add creator/provider
  schema.provider = {
    '@type': 'Organization',
    'name': agent.creator || 'DronDoc Team',
  }

  // Add image if available
  if (agent.image) {
    schema.image = agent.image
  }

  // Add category as keywords
  if (agent.category) {
    schema.keywords = agent.tags ? [agent.category, ...agent.tags].join(', ') : agent.category
  } else if (agent.tags) {
    schema.keywords = agent.tags.join(', ')
  }

  return schema
}

/**
 * Generate structured data for ItemList (Agent Marketplace)
 * @param {Array} agents - Array of agent objects
 * @returns {object} ItemList structured data
 */
export function getAgentListSchema(agents) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': 'AI Agents Marketplace',
    'description': 'Comprehensive collection of AI-powered agents and automation tools',
    'numberOfItems': agents.length,
    'itemListElement': agents.slice(0, 20).map((agent, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'item': {
        '@type': 'SoftwareApplication',
        'name': agent.name,
        'description': agent.description,
        'url': `https://dronedoc.ru/spaces#${agent.id || agent.slug}`,
        'applicationCategory': 'BusinessApplication',
      },
    })),
  }
}

/**
 * Helper to generate page-specific SEO config
 * @param {string} pageName - The name of the page
 * @param {string} description - Page description
 * @param {object} options - Additional options
 * @returns {object} SEO configuration
 */
export function generatePageSEO(pageName, description, options = {}) {
  const baseUrl = 'https://dronedoc.ru'
  const path = options.path || window.location.pathname

  return {
    title: `${pageName} | ДронДок`,
    description: description,
    url: `${baseUrl}${path}`,
    keywords: options.keywords || DEFAULT_SEO.keywords,
    image: options.image || DEFAULT_SEO.image,
    type: options.type || 'website',
    ...options,
  }
}

export default useSEO
