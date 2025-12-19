/**
 * Pool360-specific parsing logic
 * Extracts product data from raw page text
 */

/**
 * Parse Pool360 product list from raw page text
 * @param {string} rawText - Raw text from page
 * @returns {Array} Parsed product items
 */
function parsePool360ProductList(rawText) {
  const items = [];
  if (!rawText || typeof rawText !== "string") return items;

  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for "Product #:" which marks start of product details
    const productMatch = line.match(/^Product\s*#\s*:\s*(\S+)/i);
    
    if (productMatch) {
      const sku = productMatch[1];
      
      // Look backwards for manufacturer (all caps) and product name
      let manufacturer = "";
      let productName = "";
      
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j];
        
        // Skip navigation/UI elements
        if (/^(Add to|Branch|Ship|Poolcorp|FedEx|Today|Tue|Wed|Thu|Fri|Mon|Sat|Sun|\d+ of \d+|Load More|Sort|Filter|\d+ items)/i.test(prevLine)) {
          continue;
        }
        
        // Manufacturer is typically all caps
        if (/^[A-Z][A-Z\s&]+$/.test(prevLine) && prevLine.length >= 3 && prevLine.length < 30) {
          manufacturer = prevLine;
          if (j + 1 < i && !productName) {
            const nameLine = lines[j + 1];
            if (nameLine && !nameLine.startsWith("Product #") && nameLine.length > 5) {
              productName = nameLine;
            }
          }
          break;
        }
        
        // Product name detection
        if (!productName && prevLine.length > 10 && prevLine.length < 150 &&
            !prevLine.startsWith("$") && !prevLine.startsWith("Product") &&
            !/^[A-Z][A-Z\s&]+$/.test(prevLine) &&
            !/^(Branch|Ship|Poolcorp|FedEx|\d+\s+in\s+stock)/i.test(prevLine)) {
          productName = prevLine;
        }
      }

      // Look forward for Mfg Part #, price, and stock
      let mfgNumber = "";
      let price = null;
      let stock = null;
      let unitOfMeasure = "EA";

      for (let k = i + 1; k < Math.min(lines.length, i + 15); k++) {
        const nextLine = lines[k];

        // Mfg. Part #
        const mfgMatch = nextLine.match(/^Mfg\.?\s*Part\s*#\s*:\s*(\S+)/i);
        if (mfgMatch && !mfgNumber) {
          mfgNumber = mfgMatch[1];
        }

        // Price
        const priceMatch = nextLine.match(/^\$([0-9,]+(?:\.[0-9]{2})?)/);
        if (priceMatch && price === null) {
          price = parseFloat(priceMatch[1].replace(/,/g, ""));
        }

        // Stock
        const stockMatch = nextLine.match(/\((\d+)\s+in\s+stock\)/i);
        if (stockMatch && stock === null) {
          stock = parseInt(stockMatch[1], 10);
        }

        // UOM
        if (/^(EA|CS|BX|PK|FT)$/i.test(nextLine)) {
          unitOfMeasure = nextLine.toUpperCase();
        }

        // Stop at next product
        if (nextLine.startsWith("Product #:") || /^Add to Cart/i.test(nextLine)) {
          break;
        }
      }

      if (sku) {
        items.push({
          name: productName || "",
          manufacturer: manufacturer || "",
          sku: sku,
          mfgNumber: mfgNumber || "",
          upc: "",
          price: price,
          unitOfMeasure: unitOfMeasure,
          stock: stock,
          image: null,
          description: ""
        });
      }
    }
  }

  return items;
}

module.exports = {
  parsePool360ProductList
};
