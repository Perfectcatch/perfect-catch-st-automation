/**
 * Pool360 Scraper API
 * Scrapes product data from Pool360
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Import from common library (mounted at runtime)
const { normalizeResponse } = require('/app/common/normalize');
const { scoreAndSort } = require('/app/common/utils/scoring');
const { createErrorResponse } = require('/app/common/utils/error');

// Import local modules
const { searchPool360, getSearchUrl } = require('./scraper');
const { parsePool360ProductList } = require('./parser');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3000;
const BROWSERLESS_URL = process.env.BROWSERLESS_URL || "http://pool360-browserless:3000";
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || "super_random_token";
const POOL360_USERNAME = process.env.POOL360_USERNAME;
const POOL360_PASSWORD = process.env.POOL360_PASSWORD;

// Startup logging
console.log(`[${new Date().toISOString()}] Pool360 Scraper API starting...`);
console.log(`[${new Date().toISOString()}] Browserless: ${BROWSERLESS_URL}`);
console.log(`[${new Date().toISOString()}] Credentials: ${POOL360_USERNAME ? "configured" : "MISSING"}`);

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    ts: new Date().toISOString(),
    vendor: "pool360",
    credentialsConfigured: !!POOL360_USERNAME
  });
});

/**
 * Search endpoint
 */
app.post("/search", async (req, res) => {
  const { part } = req.body;
  const startTime = Date.now();

  if (!part || typeof part !== "string" || !part.trim()) {
    return res.status(400).json({ success: false, error: "Missing part parameter" });
  }

  const partNumber = part.trim();
  const searchUrl = getSearchUrl(partNumber);

  console.log(`[${new Date().toISOString()}] Searching for: ${partNumber}`);

  try {
    // Scrape Pool360
    const scrapeResult = await searchPool360(partNumber, {
      browserlessUrl: BROWSERLESS_URL,
      browserlessToken: BROWSERLESS_TOKEN,
      username: POOL360_USERNAME,
      password: POOL360_PASSWORD
    });

    const elapsed = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Scrape completed in ${elapsed}ms`);

    // Parse raw text
    const rawText = scrapeResult?.rawText || "";
    const parsedItems = parsePool360ProductList(rawText);

    // Score and sort items
    const scoredItems = scoreAndSort(partNumber, parsedItems);

    // Normalize response
    const response = normalizeResponse(partNumber, scoredItems, searchUrl);

    console.log(`[${new Date().toISOString()}] Found ${scoredItems.length} items`);

    res.json(response);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Error after ${elapsed}ms:`, error.message);

    res.status(500).json(createErrorResponse(partNumber, error, searchUrl));
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Pool360 Scraper API running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] Endpoints:`);
  console.log(`  GET  /health - Health check`);
  console.log(`  POST /search - Search products { "part": "..." }`);
});
