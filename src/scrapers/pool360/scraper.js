/**
 * Pool360-specific scraping logic
 * Uses browserless to scrape Pool360
 */

const axios = require('axios');

/**
 * Browserless function code for Pool360 scraping
 */
const browserlessFunctionCode = `
module.exports = async function ({ page, context }) {
  const { username, password, partNumber } = context;
  const baseUrl = "https://www.pool360.com";

  try {
    // Go to sign in page
    await page.goto(baseUrl + "/SignIn", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(function(r) { setTimeout(r, 3000); });

    // Click 'Sign In / Register' button to go to Azure B2C login
    await page.evaluate(function() {
      var btns = Array.from(document.querySelectorAll('button, a'));
      var signInBtn = btns.find(function(b) { 
        return b.innerText.includes('Sign In') && b.offsetParent !== null; 
      });
      if (signInBtn) signInBtn.click();
    });
    await new Promise(function(r) { setTimeout(r, 5000); });

    // Wait for Azure B2C login form
    await page.waitForSelector('#signinname', { timeout: 15000 });

    // Fill email
    await page.type('#signinname', username, { delay: 30 });

    // Fill password
    await page.type('#password', password, { delay: 30 });

    // Click Sign in button
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(function() {}),
      page.click('button[type="submit"], #next')
    ]);
    await new Promise(function(r) { setTimeout(r, 5000); });

    // Check if login was successful
    var currentUrl = page.url();
    if (currentUrl.includes('auth.pool360') || currentUrl.includes('SignIn')) {
      return {
        data: { success: false, part: partNumber, error: "Login failed - still on auth page" },
        type: "application/json"
      };
    }

    // Handle account selection page
    if (currentUrl.includes('ChangeAccount') || currentUrl.includes('SelectAccount')) {
      await page.evaluate(function() {
        var btns = Array.from(document.querySelectorAll('button'));
        var continueBtn = btns.find(function(b) { return b.innerText.trim() === 'Continue'; });
        if (continueBtn) continueBtn.click();
      });
      await new Promise(function(r) { setTimeout(r, 3000); });
    }

    // Navigate to search
    var searchUrl = baseUrl + "/search?query=" + encodeURIComponent(partNumber);
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(function(r) { setTimeout(r, 5000); });

    // Wait for results to load
    await page.waitForFunction(function() {
      var text = document.body.innerText || '';
      return text.includes('Product #:') || text.includes('items for');
    }, { timeout: 15000 }).catch(function() {});

    var pageText = await page.evaluate(function() {
      if (!document || !document.body) return "";
      return document.body.innerText || "";
    });

    return {
      data: {
        success: true,
        part: partNumber,
        rawText: pageText
      },
      type: "application/json"
    };
  } catch (err) {
    return {
      data: { success: false, part: partNumber, error: err.message },
      type: "application/json"
    };
  }
};
`;

/**
 * Search Pool360 for products
 * @param {string} partNumber - Search term
 * @param {Object} config - Configuration
 * @returns {Promise<Object>} Raw scrape result
 */
async function searchPool360(partNumber, config) {
  const { browserlessUrl, browserlessToken, username, password } = config;
  
  const response = await axios.post(
    `${browserlessUrl}/function?token=${encodeURIComponent(browserlessToken)}`,
    {
      code: browserlessFunctionCode,
      context: {
        username,
        password,
        partNumber
      }
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 90000
    }
  );

  return response.data;
}

/**
 * Get search URL for Pool360
 */
function getSearchUrl(partNumber) {
  return `https://www.pool360.com/search?query=${encodeURIComponent(partNumber)}`;
}

module.exports = {
  searchPool360,
  getSearchUrl,
  browserlessFunctionCode
};
