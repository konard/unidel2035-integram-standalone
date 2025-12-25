/**
 * Comprehensive Interface Audit for Integram Standalone
 * This script performs a thorough audit of the entire application interface
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const config = {
  baseUrl: 'https://185.128.105.78',
  credentials: {
    login: 'd',
    password: 'd'
  },
  outputDir: './experiments/comprehensive-audit-results',
  screenshotsDir: './experiments/comprehensive-audit-results/screenshots'
};

const issues = [];
const testResults = [];

function addIssue(category, severity, title, description, url, screenshot = null, details = {}) {
  issues.push({
    category,
    severity,
    title,
    description,
    url,
    screenshot,
    details,
    timestamp: new Date().toISOString()
  });
  console.log(`  [${severity.toUpperCase()}] ${title}`);
}

async function takeScreenshot(page, name) {
  const screenshotPath = path.join(config.screenshotsDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

async function attemptLogin(page) {
  console.log('\n=== Attempting Login ===');

  try {
    await page.goto(config.baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const beforeLoginPath = await takeScreenshot(page, '01-before-login');
    console.log(`Screenshot: ${beforeLoginPath}`);

    // Try to find login input fields
    const loginInput = await page.$('input[type="text"], input[name="login"], input[placeholder*="login" i], input[placeholder*="логин" i]').catch(() => null);
    const passwordInput = await page.$('input[type="password"]').catch(() => null);

    if (!loginInput || !passwordInput) {
      addIssue('Login', 'critical', 'Login form fields not found',
        `Could not locate login (${!!loginInput}) or password (${!!passwordInput}) fields`,
        config.baseUrl + '/', beforeLoginPath);
      return false;
    }

    // Fill in credentials
    await loginInput.fill(config.credentials.login);
    await passwordInput.fill(config.credentials.password);
    await page.waitForTimeout(1000);

    const filledPath = await takeScreenshot(page, '02-login-filled');
    console.log(`Screenshot: ${filledPath}`);

    // Try to find and click submit button
    const submitButton = await page.$('button[type="submit"], .p-button, button.btn, input[type="submit"]').catch(() => null);

    if (submitButton) {
      await submitButton.click();
      console.log('Clicked submit button');
    } else {
      await passwordInput.press('Enter');
      console.log('Pressed Enter on password field');
    }

    // Wait for navigation or response
    await page.waitForTimeout(5000);

    const afterLoginPath = await takeScreenshot(page, '03-after-login');
    console.log(`Screenshot: ${afterLoginPath}`);

    const currentUrl = page.url();
    console.log(`Current URL after login: ${currentUrl}`);

    // Check if we're still on login page
    const stillOnLoginPage = await page.$('input[type="password"]').catch(() => null);

    if (stillOnLoginPage) {
      // Check for error messages
      const errorMessage = await page.evaluate(() => {
        const errors = Array.from(document.querySelectorAll('.error, .p-error, .p-message-error, [class*="error"]'));
        return errors.map(e => e.textContent.trim()).join('; ');
      });

      addIssue('Login', 'high', 'Login failed - still on login page',
        `After submitting credentials, still on login page. Error message: ${errorMessage || 'none visible'}`,
        currentUrl, afterLoginPath, { errorMessage });

      return false;
    }

    console.log('Login appears successful - no longer on login page');
    return true;

  } catch (error) {
    console.error('Login error:', error.message);
    addIssue('Login', 'critical', 'Login process error',
      `Exception during login: ${error.message}`,
      config.baseUrl + '/', null, { error: error.message });
    return false;
  }
}

async function auditCurrentPage(page, pageName) {
  console.log(`\n=== Auditing: ${pageName} ===`);
  const url = page.url();
  const result = {
    name: pageName,
    url,
    timestamp: new Date().toISOString(),
    elements: {},
    issues: []
  };

  try {
    const screenshotPath = await takeScreenshot(page, `page-${pageName}`);
    console.log(`Screenshot: ${screenshotPath}`);

    // Get page title
    result.title = await page.title();
    console.log(`Title: ${result.title}`);

    // Count interactive elements
    result.elements.buttons = await page.$$eval('button, a[role="button"], .p-button', els => els.length);
    result.elements.links = await page.$$eval('a[href]', els => els.length);
    result.elements.inputs = await page.$$eval('input, textarea, select', els => els.length);
    result.elements.menus = await page.$$eval('nav, .p-menubar, .menu, [role="navigation"]', els => els.length);
    result.elements.modals = await page.$$eval('.p-dialog, .modal, [role="dialog"]', els => els.length);

    console.log(`Elements: ${result.elements.buttons} buttons, ${result.elements.links} links, ${result.elements.inputs} inputs`);
    console.log(`          ${result.elements.menus} menus, ${result.elements.modals} modals`);

    // Check for broken images
    const brokenImages = await page.$$eval('img', imgs =>
      imgs.filter(img => img.naturalWidth === 0 || img.naturalHeight === 0)
        .map(img => ({ src: img.src, alt: img.alt }))
    );

    if (brokenImages.length > 0) {
      for (const img of brokenImages) {
        addIssue('Resources', 'medium', 'Broken image',
          `Image failed to load: ${img.src}`,
          url, screenshotPath, { alt: img.alt });
      }
    }

    // Check for accessibility issues
    const accessibilityIssues = await page.evaluate(() => {
      const issues = [];

      // Buttons without labels
      document.querySelectorAll('button').forEach((btn, idx) => {
        const hasLabel = btn.textContent.trim() || btn.getAttribute('aria-label') ||
                        btn.getAttribute('title') || btn.querySelector('i, svg');
        if (!hasLabel) {
          issues.push({ type: 'button-no-label', index: idx, classes: btn.className });
        }
      });

      // Images without alt
      document.querySelectorAll('img').forEach((img, idx) => {
        if (!img.alt && !img.getAttribute('aria-label') && !img.getAttribute('role')) {
          issues.push({ type: 'img-no-alt', index: idx, src: img.src });
        }
      });

      // Links without text
      document.querySelectorAll('a[href]').forEach((link, idx) => {
        const hasText = link.textContent.trim() || link.getAttribute('aria-label') ||
                       link.getAttribute('title') || link.querySelector('i, svg, img');
        if (!hasText) {
          issues.push({ type: 'link-no-text', index: idx, href: link.href });
        }
      });

      return issues;
    });

    if (accessibilityIssues.length > 0) {
      const summary = {};
      accessibilityIssues.forEach(issue => {
        summary[issue.type] = (summary[issue.type] || 0) + 1;
      });

      Object.entries(summary).forEach(([type, count]) => {
        addIssue('Accessibility', 'low', `${count} ${type} issue(s)`,
          `Found ${count} elements with ${type}`,
          url, screenshotPath, { count, type });
      });
    }

    // Get all visible buttons and their text
    const buttons = await page.$$eval('button, a[role="button"], .p-button', btns =>
      btns.filter(btn => {
        const rect = btn.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).map((btn, idx) => ({
        index: idx,
        text: btn.textContent.trim(),
        class: btn.className,
        id: btn.id
      }))
    );

    result.visibleButtons = buttons;
    console.log(`Visible buttons: ${buttons.length}`);
    buttons.forEach(btn => console.log(`  - "${btn.text}" (${btn.class || btn.id || 'no class/id'})`));

    // Get all navigation links
    const navLinks = await page.$$eval('nav a, .p-menubar a, .menu a, [role="navigation"] a', links =>
      links.map((link, idx) => ({
        index: idx,
        text: link.textContent.trim(),
        href: link.href
      }))
    );

    result.navigationLinks = navLinks;
    console.log(`Navigation links: ${navLinks.length}`);
    navLinks.forEach(link => console.log(`  - "${link.text}" -> ${link.href}`));

  } catch (error) {
    console.error(`Error auditing ${pageName}:`, error.message);
    addIssue('Audit', 'medium', `Failed to fully audit ${pageName}`,
      `Error: ${error.message}`,
      url, null, { error: error.message });
  }

  testResults.push(result);
  return result;
}

async function testNavigation(page, result) {
  console.log('\n=== Testing Navigation ===');

  // Try clicking each navigation link
  for (const link of result.navigationLinks.slice(0, 10)) { // Test first 10 links
    try {
      console.log(`\nTesting navigation to: ${link.text} (${link.href})`);

      // Get current URL before click
      const beforeUrl = page.url();

      // Click the link
      const linkElement = await page.$$('nav a, .p-menubar a, .menu a, [role="navigation"] a').then(els => els[link.index]);
      if (linkElement) {
        await linkElement.click();
        await page.waitForTimeout(2000);

        const afterUrl = page.url();
        const screenshotPath = await takeScreenshot(page, `nav-${link.index}-${link.text.replace(/[^a-zA-Z0-9]/g, '_')}`);

        if (afterUrl === beforeUrl) {
          console.log(`  No navigation occurred (same URL)`);
        } else {
          console.log(`  Navigated to: ${afterUrl}`);
        }

        // Check for 404 or error pages
        const title = await page.title();
        const bodyText = await page.evaluate(() => document.body.textContent.toLowerCase());

        if (title.includes('404') || title.includes('Not Found') || bodyText.includes('not found')) {
          addIssue('Navigation', 'high', `Navigation link leads to 404: ${link.text}`,
            `Link "${link.text}" (${link.href}) leads to 404 page`,
            afterUrl, screenshotPath);
        } else if (bodyText.includes('forbidden') || bodyText.includes('403')) {
          addIssue('Navigation', 'high', `Navigation link leads to 403: ${link.text}`,
            `Link "${link.text}" (${link.href}) leads to forbidden page`,
            afterUrl, screenshotPath);
        }

        // Go back for next test
        await page.goBack();
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      console.error(`  Error testing link "${link.text}":`, error.message);
    }
  }
}

async function testButtons(page, result) {
  console.log('\n=== Testing Buttons ===');

  // Test first few buttons
  for (const button of result.visibleButtons.slice(0, 5)) {
    try {
      console.log(`\nTesting button: "${button.text}"`);

      const beforeUrl = page.url();
      const buttonElements = await page.$$('button, a[role="button"], .p-button');
      const buttonElement = buttonElements[button.index];

      if (buttonElement) {
        await buttonElement.click();
        await page.waitForTimeout(2000);

        const afterUrl = page.url();
        const screenshotPath = await takeScreenshot(page, `button-${button.index}-${button.text.replace(/[^a-zA-Z0-9]/g, '_')}`);

        // Check if modal appeared
        const modalVisible = await page.$eval('.p-dialog, .modal, [role="dialog"]',
          el => el.offsetWidth > 0 && el.offsetHeight > 0
        ).catch(() => false);

        if (modalVisible) {
          console.log(`  Modal/dialog appeared`);

          // Close modal if visible
          const closeButton = await page.$('.p-dialog-header-close, .modal-close, [aria-label="Close"]').catch(() => null);
          if (closeButton) {
            await closeButton.click();
            await page.waitForTimeout(500);
          }
        }

        if (afterUrl !== beforeUrl) {
          console.log(`  Navigation occurred: ${afterUrl}`);
        }
      }
    } catch (error) {
      console.error(`  Error testing button "${button.text}":`, error.message);
    }
  }
}

async function generateReport() {
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: config.baseUrl,
    totalIssues: issues.length,
    issuesBySeverity: {
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length
    },
    issuesByCategory: {},
    pages: testResults,
    issues
  };

  // Group issues by category
  issues.forEach(issue => {
    report.issuesByCategory[issue.category] = (report.issuesByCategory[issue.category] || 0) + 1;
  });

  // Save JSON report
  const reportPath = path.join(config.outputDir, 'comprehensive-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON report saved: ${reportPath}`);

  // Generate markdown report
  let markdown = `# Comprehensive Interface Audit Report\n\n`;
  markdown += `**Date:** ${new Date().toISOString()}\n`;
  markdown += `**Base URL:** ${config.baseUrl}\n`;
  markdown += `**Pages Tested:** ${testResults.length}\n`;
  markdown += `**Total Issues:** ${issues.length}\n\n`;

  markdown += `## Summary\n\n`;
  markdown += `### Issues by Severity\n`;
  markdown += `- 🔴 Critical: ${report.issuesBySeverity.critical}\n`;
  markdown += `- 🟠 High: ${report.issuesBySeverity.high}\n`;
  markdown += `- 🟡 Medium: ${report.issuesBySeverity.medium}\n`;
  markdown += `- 🟢 Low: ${report.issuesBySeverity.low}\n\n`;

  markdown += `### Issues by Category\n`;
  Object.entries(report.issuesByCategory).forEach(([category, count]) => {
    markdown += `- ${category}: ${count}\n`;
  });
  markdown += `\n`;

  // List issues by severity
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    const severityIssues = issues.filter(i => i.severity === severity);
    if (severityIssues.length > 0) {
      markdown += `## ${severity.toUpperCase()} Priority Issues\n\n`;
      severityIssues.forEach((issue, idx) => {
        markdown += `### ${idx + 1}. ${issue.title}\n\n`;
        markdown += `- **Category:** ${issue.category}\n`;
        markdown += `- **URL:** ${issue.url}\n`;
        markdown += `- **Description:** ${issue.description}\n`;
        if (issue.screenshot) {
          markdown += `- **Screenshot:** ${issue.screenshot}\n`;
        }
        if (Object.keys(issue.details).length > 0) {
          markdown += `- **Details:** ${JSON.stringify(issue.details)}\n`;
        }
        markdown += `\n`;
      });
    }
  }

  // Add page details
  markdown += `## Pages Tested\n\n`;
  testResults.forEach((page, idx) => {
    markdown += `### ${idx + 1}. ${page.name}\n\n`;
    markdown += `- **URL:** ${page.url}\n`;
    markdown += `- **Title:** ${page.title}\n`;
    markdown += `- **Elements:**\n`;
    markdown += `  - Buttons: ${page.elements.buttons}\n`;
    markdown += `  - Links: ${page.elements.links}\n`;
    markdown += `  - Inputs: ${page.elements.inputs}\n`;
    markdown += `  - Menus: ${page.elements.menus}\n`;
    markdown += `  - Modals: ${page.elements.modals}\n`;
    markdown += `\n`;
  });

  const markdownPath = path.join(config.outputDir, 'comprehensive-audit-report.md');
  fs.writeFileSync(markdownPath, markdown);
  console.log(`Markdown report saved: ${markdownPath}`);

  return report;
}

async function main() {
  console.log('='.repeat(60));
  console.log('COMPREHENSIVE INTERFACE AUDIT');
  console.log('='.repeat(60));
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Output: ${config.outputDir}`);

  // Create output directories
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.mkdirSync(config.screenshotsDir, { recursive: true });

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
      console.log(`[Browser Console Error] ${msg.text()}`);
    }
  });

  try {
    // Attempt login
    const loginSuccess = await attemptLogin(page);

    // Audit current page (login or main page after login)
    const mainPageResult = await auditCurrentPage(page, 'main-page');

    if (loginSuccess) {
      // Test navigation
      await testNavigation(page, mainPageResult);

      // Test buttons
      await testButtons(page, mainPageResult);
    }

    // Generate final report
    const report = await generateReport();

    console.log('\n' + '='.repeat(60));
    console.log('AUDIT COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total Issues: ${report.totalIssues}`);
    console.log(`Critical: ${report.issuesBySeverity.critical}`);
    console.log(`High: ${report.issuesBySeverity.high}`);
    console.log(`Medium: ${report.issuesBySeverity.medium}`);
    console.log(`Low: ${report.issuesBySeverity.low}`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
