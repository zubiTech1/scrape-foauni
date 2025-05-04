const puppeteer = require('puppeteer');
const fs = require('fs-extra');

const BASE_URL = 'https://fouanistore.com';

async function setupBrowser() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080'
        ],
        defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.evaluateOnNewDocument(() => {
        delete navigator.__proto__.webdriver;
    });

    return { browser, page };
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForElement(page, selector, timeout = 20000) {
    try {
        await page.waitForSelector(selector, { timeout });
        return true;
    } catch (error) {
        console.log(`Timeout waiting for element: ${selector}`);
        return false;
    }
}

async function getProductLinks(page, url) {
    const productLinks = [];
    const productStockStatus = {};

    try {
        console.log(`\nVisiting category: ${url}`);
        await page.goto(url);
        await delay(5000);

        // Wait for products to load
        await waitForElement(page, '.RSingleProduct_mainDiv__42N9L');

        while (true) {
            // Get all product cards using multiple possible selectors
            const productCards = await page.$$eval(
                '.RSingleProduct_mainDiv__42N9L, div[data-testid="product-card"], .product-card, article.product-item',
                cards => cards.map(card => {
                    const link = card.querySelector('a')?.href;
                    const isOutOfStock = card.querySelector('.RSingleProduct_ribbon__KFgvr')?.textContent.includes('Out of Stock') || false;
                    return { link, isOutOfStock };
                })
            );

            console.log(`Found ${productCards.length} products on current page`);

            for (const { link, isOutOfStock } of productCards) {
                if (link && !productLinks.includes(link)) {
                    productLinks.push(link);
                    productStockStatus[link] = isOutOfStock;
                    console.log(`Found product: ${link} (${isOutOfStock ? 'Out of Stock' : 'In Stock'})`);
                }
            }

            // Check for next page
            const hasNextPage = await page.evaluate(() => {
                const pagination = document.querySelector('.flex.items-center.justify-center.lg\\:justify-end.gap-2.my-4');
                if (!pagination) return false;

                const currentPage = Array.from(pagination.querySelectorAll('a')).find(
                    a => a.className.includes('bg-[var(--md-sys-color-primary)]')
                );

                if (!currentPage) return false;

                const currentPageNum = parseInt(currentPage.textContent);
                const nextPageLink = Array.from(pagination.querySelectorAll('a')).find(
                    a => parseInt(a.textContent) === currentPageNum + 1
                );

                return nextPageLink !== undefined;
            });

            if (hasNextPage) {
                await page.evaluate(() => {
                    const pagination = document.querySelector('.flex.items-center.justify-center.lg\\:justify-end.gap-2.my-4');
                    const currentPage = Array.from(pagination.querySelectorAll('a')).find(
                        a => a.className.includes('bg-[var(--md-sys-color-primary)]')
                    );
                    const currentPageNum = parseInt(currentPage.textContent);
                    const nextPageLink = Array.from(pagination.querySelectorAll('a')).find(
                        a => parseInt(a.textContent) === currentPageNum + 1
                    );
                    nextPageLink.click();
                });
                await delay(3000);
            } else {
                console.log('No more pages to process');
                break;
            }
        }

    } catch (error) {
        console.error(`Error getting product links: ${error.message}`);
    }

    return { productLinks, productStockStatus };
}

async function extractProductDetails(page, url, isOutOfStock = false) {
    console.log(`\nExtracting details for: ${url}`);

    try {
        await page.goto(url);
        await delay(5000);

        const productDetail = {
            url,
            stock_status: isOutOfStock ? 'Out of Stock' : 'In Stock'
        };

        // Extract title
        productDetail.title = await page.$eval('h1.headline-large',
            el => el.textContent.trim()
        ).catch(() => null);

        // Extract manufacturer
        productDetail.manufacturer = await page.$eval('div.body-large.undefined span',
            el => el.textContent.replace('By ', '').replace('.', '').trim()
        ).catch(() => null);

        // Extract SKU


        productDetail.sku = await page.$eval('xpath///div[contains(text(), "SKU:")]',
            el => el.textContent.replace('SKU:', '').trim()
        ).catch(() => {
            console.log('Error extracting SKU');
            return null;
        });

        // Extract price
        productDetail.price = await page.$eval('h4.title-large', el => {
            const priceText = el.textContent.trim();
            return parseFloat(priceText.replace(/[^\d.]/g, ''));
        }).catch(() => null);

        // Extract images
        productDetail.images = await page.$$eval('img.RProduct_swiperImage__y1ZsF',
            imgs => imgs.map(img => img.src)
        );

        // Extract description and PDFs
        const descElement = await page.$('#desc');
        if (descElement) {
            const html = await page.evaluate(el => el.innerHTML, descElement);
            const [description, pdfsSection] = html.split('<h4>Related PDFs:</h4>');

            productDetail.description = description
                .replace('<h4>Description:</h4>', '')
                .trim();

            if (pdfsSection) {
                productDetail.related_pdfs = await page.$$eval('#desc a', links =>
                    links.map(link => ({
                        title: link.textContent.trim(),
                        url: link.href
                    }))
                );
            } else {
                productDetail.related_pdfs = [];
            }
        }

        // Extract specifications
        productDetail.specifications = {};
        const specRows = await page.$$('div.RProduct_divAtt__Z4Pc0');
        for (const row of specRows) {
            const [title, value] = await Promise.all([
                row.$eval('span.RProduct_spanTitle__CZ1Ab', el => el.textContent.trim()),
                row.$eval('span.RProduct_spanValue__J8CAs', el => el.textContent.trim())
            ]);

            if (title && value) {
                productDetail.specifications[title] = value;
            }
        }

        console.log(`Successfully extracted details for: ${productDetail.title || 'Unknown Product'}`);
        return productDetail;

    } catch (error) {
        console.error(`Error extracting details from ${url}: ${error.message}`);
        return null;
    }
}

async function saveProductsToJson(products, filename = 'products.json') {
    try {
        let existingProducts = [];
        try {
            existingProducts = await fs.readJson(filename);
        } catch { }

        const allProducts = existingProducts.concat(products);
        await fs.writeJson(filename, allProducts, { spaces: 4 });
        console.log(`\nSuccessfully saved ${products.length} new products. Total products: ${allProducts.length}`);

    } catch (error) {
        console.error(`Error saving products to JSON: ${error.message}`);
    }
}

async function main() {
    let browser;
    try {
        const menuData = await fs.readJson('menu_structure.json');

        console.log('\nInitializing Puppeteer...');
        const { browser: _browser, page } = await setupBrowser();
        browser = _browser;

        const allProducts = [];

        for (const category of menuData.categories) {
            console.log(`\nProcessing category: ${category.title}`);

            for (const subcategory of category.subcategories) {
                if (subcategory.title.toLowerCase() === 'all') continue;

                console.log(`\nProcessing subcategory: ${subcategory.title}`);

                const { productLinks, productStockStatus } = await getProductLinks(page, subcategory.link);

                for (const [index, url] of productLinks.entries()) {
                    console.log(`\nProcessing product ${index + 1}/${productLinks.length}`);
                    const productDetails = await extractProductDetails(page, url, productStockStatus[url]);
                    if (productDetails) {
                        allProducts.push(productDetails);
                    }
                }

                if (allProducts.length > 0) {
                    await saveProductsToJson(allProducts);
                    allProducts.length = 0; // Clear the array
                }
            }
        }

    } catch (error) {
        console.error(`\nError in main process: ${error.message}`);
    } finally {
        if (browser) {
            console.log('\nClosing Puppeteer...');
            await browser.close();
        }
    }
}

// Run the scraper
main();