/**
 * Test different URL patterns to find working endpoints
 */

const { chromium } = require('@playwright/test');

const urls = [
  'https://185.128.105.78/',
  'https://185.128.105.78/app',
  'https://185.128.105.78/app/',
  'https://185.128.105.78/app/index.html',
  'https://185.128.105.78/index.html',
];

async function testUrls() {
  const browser = await chromium.launch({
    headless: true,
    ignoreHTTPSErrors: true
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  for (const url of urls) {
    try {
      console.log(`\nTesting: ${url}`);
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });

      const status = response?.status() || 'no response';
      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body.textContent.substring(0, 100));

      console.log(`  Status: ${status}`);
      console.log(`  Title: ${title}`);
      console.log(`  Body preview: ${bodyText.trim()}`);

      if (status === 200 && title !== '403 Forbidden' && title !== '404 Not Found') {
        console.log(`  ✓ URL appears to work!`);
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }

  await browser.close();
}

testUrls().catch(console.error);
