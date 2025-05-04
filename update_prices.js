const fs = require('fs').promises;

function calculateNewPrice(originalPrice) {
    if (originalPrice === null || originalPrice === undefined) {
        return null;
    }
    
    if (originalPrice < 40000) return originalPrice + 5000;
    if (originalPrice <= 80000) return originalPrice + 10000;
    if (originalPrice <= 99000) return originalPrice + 15000;
    if (originalPrice <= 150000) return originalPrice + 20000;
    if (originalPrice <= 200000) return originalPrice + 30000;
    if (originalPrice <= 450000) return originalPrice + 40000;
    if (originalPrice <= 700000) return originalPrice + 50000;
    if (originalPrice <= 900000) return originalPrice + 60000;
    if (originalPrice <= 999000) return originalPrice + 80000;
    if (originalPrice <= 1990000) return originalPrice + 100000;
    if (originalPrice <= 2000000) return originalPrice + 200000;
    
    // For prices above 2M
    const additionalMillions = Math.floor((originalPrice - 2000000) / 1000000);
    return originalPrice + (100000 * (additionalMillions + 2));
}

async function updateProductPrices(inputFile = 'products.json', outputFile = 'products_updated_prices.json') {
    try {
        console.log(`Reading products from ${inputFile}...`);
        const products = JSON.parse(await fs.readFile(inputFile, 'utf8'));
        
        console.log(`Found ${products.length} products to update`);
        
        for (const [index, product] of products.entries()) {
            try {
                const originalPrice = product.price;
                if (originalPrice !== null && originalPrice !== undefined) {
                    product.original_price = originalPrice;
                    product.price = calculateNewPrice(originalPrice);
                    console.log(`Updated product ${index + 1}/${products.length}: ${originalPrice} -> ${product.price}`);
                } else {
                    console.log(`Product ${index + 1}/${products.length} has no price`);
                }
            } catch (error) {
                console.error(`Error updating product ${index + 1}:`, error);
            }
        }
        
        console.log(`\nWriting updated products to ${outputFile}...`);
        await fs.writeFile(outputFile, JSON.stringify(products, null, 4));
        
        console.log(`\nSuccessfully updated ${products.length} products`);
        console.log(`Original prices are stored in 'original_price' field`);
        console.log(`New prices are stored in 'price' field`);
        
    } catch (error) {
        console.error('Error updating product prices:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    updateProductPrices();
}

module.exports = { calculateNewPrice, updateProductPrices };