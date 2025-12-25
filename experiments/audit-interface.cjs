/**
 * Interface audit script for Integram Standalone
 * Tests the application interface and documents issues
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  baseUrl: 'https://185.128.105.78',
  credentials: {
    login: 'd',
    password: 'd'
  },
  urls: [
    '/',
    '/welcome',
    '/integram/my'
  ],
  outputDir: './experiments/audit-results',
  screenshotsDir: './experiments/audit-results/screenshots'
};

// Issues tracking
const issues = [];

function addIssue(category, severity, title, description, url, screenshot = null) {
  issues.push({
    category,
    severity,
    title,
    description,
    url,
    screenshot,
    timestamp: new Date().toISOString()
  });
}

async function takeScreenshot(page, name) {
  const screenshotPath = path.join(config.screenshotsDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

async function auditPage(page, url, name) {
  console.log(`\n=== Auditing: ${url} ===`);
  const fullUrl = config.baseUrl + url;

  try {
    // Navigate to page
    const response = await page.goto(fullUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Check response status
    if (!response || response.status() !== 200) {
      addIssue(
        'Navigation',
        'high',
        `Page returns ${response?.status() || 'no response'}`,
        `URL ${fullUrl} returned status code ${response?.status() || 'unknown'}`,
        fullUrl
      );
    }

    // Take screenshot
    const screenshotPath = await takeScreenshot(page, `${name}-initial`);
    console.log(`Screenshot saved: ${screenshotPath}`);

    // Wait a bit for content to load
    await page.waitForTimeout(2000);

    // Get page title
    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Check for console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Get all interactive elements
    const buttons = await page.$$('button, a[role="button"], .p-button');
    const links = await page.$$('a[href]');
    const inputs = await page.$$('input, textarea, select');

    console.log(`Found ${buttons.length} buttons, ${links.length} links, ${inputs.length} inputs`);

    // Check for broken images
    const images = await page.$$eval('img', imgs =>
      imgs.map(img => ({
        src: img.src,
        alt: img.alt,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      }))
    );

    for (const img of images) {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        addIssue(
          'Resources',
          'medium',
          'Broken image detected',
          `Image at ${img.src} failed to load (alt: "${img.alt}")`,
          fullUrl,
          screenshotPath
        );
      }
    }

    // Check for 404 network errors
    const failedRequests = [];
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        error: request.failure().errorText
      });
    });

    // Try clicking main navigation elements
    const navItems = await page.$$('.p-menubar-root-list > li, nav a, .navigation a');
    console.log(`Found ${navItems.length} navigation items`);

    // Check for accessibility issues
    const accessibilityIssues = await page.evaluate(() => {
      const issues = [];

      // Check for buttons without labels
      document.querySelectorAll('button').forEach(btn => {
        const hasLabel = btn.textContent.trim() || btn.getAttribute('aria-label') || btn.getAttribute('title');
        if (!hasLabel) {
          issues.push({
            type: 'missing-label',
            element: 'button',
            selector: btn.className || btn.id || 'unknown'
          });
        }
      });

      // Check for images without alt
      document.querySelectorAll('img').forEach(img => {
        if (!img.alt && !img.getAttribute('aria-label')) {
          issues.push({
            type: 'missing-alt',
            element: 'img',
            src: img.src
          });
        }
      });

      return issues;
    });

    for (const issue of accessibilityIssues) {
      addIssue(
        'Accessibility',
        'low',
        `${issue.type} in ${issue.element}`,
        `Element ${issue.selector || issue.src} is missing required accessibility attribute`,
        fullUrl
      );
    }

    return {
      url: fullUrl,
      title,
      buttons: buttons.length,
      links: links.length,
      inputs: inputs.length,
      errors: errors.length,
      screenshots: [screenshotPath]
    };

  } catch (error) {
    console.error(`Error auditing ${url}:`, error.message);
    addIssue(
      'Critical',
      'critical',
      `Failed to audit page: ${url}`,
      `Error: ${error.message}`,
      fullUrl
    );
    return null;
  }
}

async function testLogin(page) {
  console.log('\n=== Testing Login ===');
  const loginUrl = config.baseUrl + '/';

  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Take screenshot before login
    await takeScreenshot(page, 'before-login');

    // Look for login form
    const loginForm = await page.$('form, .login-form, [class*="login"]');
    if (!loginForm) {
      addIssue(
        'Login',
        'critical',
        'Login form not found',
        'Could not locate login form on the page',
        loginUrl
      );
      return false;
    }

    // Try to find username/login field
    const usernameField = await page.$('input[name="username"], input[name="login"], input[type="text"]');
    if (!usernameField) {
      addIssue(
        'Login',
        'critical',
        'Username field not found',
        'Could not locate username input field',
        loginUrl
      );
      return false;
    }

    // Try to find password field
    const passwordField = await page.$('input[name="password"], input[type="password"]');
    if (!passwordField) {
      addIssue(
        'Login',
        'critical',
        'Password field not found',
        'Could not locate password input field',
        loginUrl
      );
      return false;
    }

    // Fill in credentials
    await usernameField.fill(config.credentials.login);
    await passwordField.fill(config.credentials.password);

    // Take screenshot with filled form
    await takeScreenshot(page, 'login-filled');

    // Submit form
    const submitButton = await page.$('button[type="submit"], input[type="submit"], .p-button');
    if (submitButton) {
      await submitButton.click();
    } else {
      await passwordField.press('Enter');
    }

    // Wait for navigation or error
    await page.waitForTimeout(3000);

    // Take screenshot after login attempt
    await takeScreenshot(page, 'after-login');

    // Check if login was successful
    const currentUrl = page.url();
    const isLoggedIn = currentUrl !== loginUrl || await page.$('.user-menu, .logout, [class*="logout"]');

    if (!isLoggedIn) {
      addIssue(
        'Login',
        'high',
        'Login may have failed',
        `Still on login page after submitting credentials. Current URL: ${currentUrl}`,
        currentUrl
      );
    }

    console.log(`Login attempt completed. Current URL: ${currentUrl}`);
    return isLoggedIn;

  } catch (error) {
    console.error('Login error:', error.message);
    addIssue(
      'Login',
      'critical',
      'Login process failed',
      `Error during login: ${error.message}`,
      loginUrl
    );
    return false;
  }
}

async function main() {
  console.log('Starting Integram Standalone Interface Audit...');
  console.log(`Base URL: ${config.baseUrl}`);

  // Create output directories
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.mkdirSync(config.screenshotsDir, { recursive: true });

  // Launch browser with SSL verification disabled
  const browser = await chromium.launch({
    headless: true,
    ignoreHTTPSErrors: true
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Set up console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Console Error] ${msg.text()}`);
    }
  });

  // Set up network error logging
  page.on('requestfailed', request => {
    console.log(`[Network Error] ${request.url()} - ${request.failure().errorText}`);
  });

  try {
    // Test login
    const loginSuccess = await testLogin(page);

    if (!loginSuccess) {
      console.log('Login failed or could not be verified. Continuing audit anyway...');
    }

    // Audit each URL
    const results = [];
    for (const url of config.urls) {
      const result = await auditPage(page, url, url.replace(/\//g, '-'));
      if (result) {
        results.push(result);
      }
      await page.waitForTimeout(1000);
    }

    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl: config.baseUrl,
      pagesAudited: results.length,
      totalIssues: issues.length,
      issuesBySeverity: {
        critical: issues.filter(i => i.severity === 'critical').length,
        high: issues.filter(i => i.severity === 'high').length,
        medium: issues.filter(i => i.severity === 'medium').length,
        low: issues.filter(i => i.severity === 'low').length
      },
      results,
      issues
    };

    // Save report
    const reportPath = path.join(config.outputDir, 'audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

    // Generate markdown report
    let markdown = `# Interface Audit Report\n\n`;
    markdown += `**Date:** ${new Date().toISOString()}\n`;
    markdown += `**Base URL:** ${config.baseUrl}\n`;
    markdown += `**Pages Audited:** ${results.length}\n`;
    markdown += `**Total Issues:** ${issues.length}\n\n`;

    markdown += `## Issues by Severity\n\n`;
    markdown += `- Critical: ${report.issuesBySeverity.critical}\n`;
    markdown += `- High: ${report.issuesBySeverity.high}\n`;
    markdown += `- Medium: ${report.issuesBySeverity.medium}\n`;
    markdown += `- Low: ${report.issuesBySeverity.low}\n\n`;

    if (issues.length > 0) {
      markdown += `## Issues Found\n\n`;

      for (const severity of ['critical', 'high', 'medium', 'low']) {
        const severityIssues = issues.filter(i => i.severity === severity);
        if (severityIssues.length > 0) {
          markdown += `### ${severity.toUpperCase()} Issues\n\n`;
          for (const issue of severityIssues) {
            markdown += `#### ${issue.title}\n\n`;
            markdown += `- **Category:** ${issue.category}\n`;
            markdown += `- **URL:** ${issue.url}\n`;
            markdown += `- **Description:** ${issue.description}\n`;
            if (issue.screenshot) {
              markdown += `- **Screenshot:** ${issue.screenshot}\n`;
            }
            markdown += `\n`;
          }
        }
      }
    } else {
      markdown += `## No Issues Found\n\nAll pages passed the audit successfully!\n`;
    }

    const markdownPath = path.join(config.outputDir, 'audit-report.md');
    fs.writeFileSync(markdownPath, markdown);
    console.log(`Markdown report saved to: ${markdownPath}`);

    console.log('\n=== Audit Complete ===');
    console.log(`Total issues found: ${issues.length}`);
    console.log(`Critical: ${report.issuesBySeverity.critical}`);
    console.log(`High: ${report.issuesBySeverity.high}`);
    console.log(`Medium: ${report.issuesBySeverity.medium}`);
    console.log(`Low: ${report.issuesBySeverity.low}`);

  } catch (error) {
    console.error('Fatal error during audit:', error);
  } finally {
    await browser.close();
  }
}

// Run audit
main().catch(console.error);
