require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BROWSERLESS_URL = process.env.BROWSERLESS_URL || "http://ced-browserless:3000";
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || "super_random_token";
const CED_USERNAME = process.env.CED_USERNAME;
const CED_PASSWORD = process.env.CED_PASSWORD;

function similarity(a, b) {
  a = (a || "").toLowerCase();
  b = (b || "").toLowerCase();
  if (!a || !b) return 0;

  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));

  let overlap = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) overlap++;
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

function scoreItem(query, item) {
  const base = (query || "").toLowerCase();
  const name = item.name || "";
  const desc = item.text || "";

  const nameScore = similarity(base, name);
  const descScore = similarity(base, desc);

  const codeBlob = `${item.cat || ""} ${item.item || item.sku || ""}`.toLowerCase();
  const codeScore = base.split(/\s+/).some(w => w && codeBlob.includes(w)) ? 0.2 : 0;

  return (nameScore * 0.6) + (descScore * 0.2) + codeScore;
}

function parseCedProductList(rawText, partNumber) {
  const items = [];
  if (!rawText || typeof rawText !== "string") return items;

  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("Local Description:")) continue;

    const localDescription = lines[i].substring("Local Description:".length).trim();

    let catNumber = null;
    let itemNumber = null;
    let upc = null;
    let manufacturer = null;
    let descriptionLines = [];
    let price = null;
    let stock = null;
    let unitOfMeasure = null;

    // Look backwards for manufacturer (usually 2-4 lines before Local Description)
    for (let b = i - 1; b >= Math.max(0, i - 5); b--) {
      const prevLine = lines[b];
      // Manufacturer is usually all caps, no special prefixes
      if (/^[A-Z][A-Z\s&]+$/.test(prevLine) && prevLine.length > 2 && prevLine.length < 50) {
        manufacturer = prevLine;
        break;
      }
    }

    for (let j = i + 1; j < Math.min(lines.length, i + 30); j++) {
      const line = lines[j];

      if (!catNumber && line.startsWith("Cat #:")) {
        catNumber = line.substring("Cat #:".length).trim();
      }

      if (!itemNumber && line.startsWith("Item #:")) {
        itemNumber = line.substring("Item #:".length).trim();
      }

      if (!upc && line.startsWith("UPC:")) {
        upc = line.substring("UPC:".length).trim();
      }

      if (/^Specifications:/.test(line)) {
        for (let k = j + 1; k < Math.min(lines.length, j + 15); k++) {
          const specLine = lines[k];
          if (/^Quantity for /.test(specLine)) break;
          if (/^Local Description:/.test(specLine)) break;
          if (/^\$/.test(specLine)) break;
          descriptionLines.push(specLine);
        }
      }

      // Extract price (e.g., "$33.00")
      if (price === null && /^\$[0-9]/.test(line)) {
        const m = line.match(/^\$([0-9]+(?:[.,][0-9]{2})?)/);
        if (m) {
          const num = parseFloat(m[1].replace(",", ""));
          if (!Number.isNaN(num)) price = num;
        }
      }

      // Extract unit of measure (e.g., "each", "per 100", "per foot")
      if (unitOfMeasure === null && /^(each|per\s+\d+|per\s+foot|per\s+ft|\/\s*\d+)/i.test(line)) {
        unitOfMeasure = line;
      }

      // Extract stock (e.g., "20 in stock", "In Stock", "Out of Stock")
      if (stock === null) {
        const stockMatch = line.match(/^(\d+)\s+in\s+stock/i);
        if (stockMatch) {
          stock = parseInt(stockMatch[1], 10);
        } else if (/^in\s+stock/i.test(line)) {
          stock = "In Stock";
        } else if (/^out\s+of\s+stock/i.test(line)) {
          stock = 0;
        }
      }

      // Stop at next product
      if (j > i + 5 && line.startsWith("Local Description:")) break;
    }

    const start = Math.max(0, i - 4);
    const end = Math.min(lines.length, i + 25);
    const segmentText = lines.slice(start, end).join("\n");

    items.push({
      name: localDescription || catNumber || itemNumber || "",
      manufacturer: manufacturer || "",
      cat: catNumber || "",
      item: itemNumber || "",
      sku: itemNumber || "",
      upc: upc || "",
      price: price !== null ? price : null,
      unitOfMeasure: unitOfMeasure || "each",
      stock: stock !== null ? stock : null,
      image: null,
      description: descriptionLines.join(" ") || "",
      text: segmentText,
      score: null
    });
  }

  return items;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

app.post("/search", async (req, res) => {
  const { part } = req.body;
  const startTime = Date.now();

  if (!part || typeof part !== "string" || !part.trim()) {
    return res.status(400).json({ success: false, error: "Missing part parameter" });
  }

  const partNumber = part.trim();
  console.log(`[${new Date().toISOString()}] Searching for: ${partNumber}`);

  // Build the browserless function code with embedded credentials (browserless v2 format)
  const functionCode = `
module.exports = async function ({ page, context }) {
  const { username, password, partNumber } = context;
  const baseUrl = "https://cedlargo.portalced.com";

  try {
    // Go to login page
    await page.goto(baseUrl + "/login", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(function(r) { setTimeout(r, 2000); });

    // Wait for and fill username field using data-id selector
    await page.waitForSelector('[data-id="username"]', { timeout: 15000 });
    await page.type('[data-id="username"]', username, { delay: 40 });

    // Wait for and fill password field using data-id selector
    await page.waitForSelector('[data-id="password"]', { timeout: 15000 });
    await page.type('[data-id="password"]', password, { delay: 40 });

    // Click login button and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(function() {}),
      page.click('button[type="submit"]')
    ]);
    await new Promise(function(r) { setTimeout(r, 2000); });

    // Verify login success - check if still on login page
    var currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      // Retry login once
      await page.waitForSelector('[data-id="username"]', { timeout: 10000 });
      await page.evaluate(function() {
        var u = document.querySelector('[data-id="username"]');
        var p = document.querySelector('[data-id="password"]');
        if (u) u.value = "";
        if (p) p.value = "";
      });
      await page.type('[data-id="username"]', username, { delay: 40 });
      await page.type('[data-id="password"]', password, { delay: 40 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(function() {}),
        page.click('button[type="submit"]')
      ]);
      await new Promise(function(r) { setTimeout(r, 2000); });

      currentUrl = page.url();
      if (currentUrl.includes("/login")) {
        return {
          data: { success: false, part: partNumber, error: "Login failed after retry" },
          type: "application/json"
        };
      }
    }

    // Navigate to search (product list endpoint)
    const searchUrl = baseUrl + "/product-list?term=" + encodeURIComponent(partNumber);
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(function(r) { setTimeout(r, 2000); });

    const pageText = await page.evaluate(function() {
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

  try {
    const response = await axios.post(
      `${BROWSERLESS_URL}/function?token=${encodeURIComponent(BROWSERLESS_TOKEN)}`,
      {
        code: functionCode,
        context: {
          username: CED_USERNAME,
          password: CED_PASSWORD,
          partNumber
        }
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 90000
      }
    );

    const elapsed = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Completed in ${elapsed}ms`);

    const rawText = response.data && typeof response.data.rawText === "string" ? response.data.rawText : "";
    const parsedItems = parseCedProductList(rawText, partNumber);

    const scoredItems = parsedItems.map((item) => {
      const score = scoreItem(partNumber, item);
      return { ...item, score: Number(score.toFixed(3)) };
    }).sort((a, b) => (b.score || 0) - (a.score || 0));

    const best = scoredItems[0] || {};

    const result = {
      success: true,
      part: partNumber,
      name: best.name || "Not found",
      price: typeof best.price === "number" ? best.price : null,
      stock: "Unknown",
      url: `https://cedlargo.portalced.com/product-list?term=${encodeURIComponent(partNumber)}`,
      bestMatch: best.name ? {
        name: best.name,
        manufacturer: best.manufacturer || "",
        cat: best.cat || "",
        sku: best.sku || best.item || "",
        upc: best.upc || "",
        price: typeof best.price === "number" ? best.price : null,
        unitOfMeasure: best.unitOfMeasure || "each",
        stock: best.stock !== null ? best.stock : null,
        image: best.image || null,
        description: best.description || "",
        confidence: best.score || 0
      } : null,
      items: scoredItems
    };

    res.json(result);
  } catch (error) {
    console.error("Scraper error:", error.message);
    res.status(500).json({
      success: false,
      part: partNumber,
      error: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`CED Scraper API running on port ${PORT}`);
  console.log(`Browserless: ${BROWSERLESS_URL}`);
  console.log(`Credentials: ${CED_USERNAME ? "configured" : "MISSING"}`);
});
