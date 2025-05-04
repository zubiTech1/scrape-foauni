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
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Disable webdriver detection
    await page.evaluateOnNewDocument(() => {
        delete navigator.__proto__.webdriver;
    });
    
    return { browser, page };
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

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractCategories(page) {
    const categories = [];
    
    try {
        // Click the "All Categories" button
        const buttonSelector = 'button.flex.items-center.gap-2.flex-shrink-0.on-surface-text.label-large.pr-6';
        await waitForElement(page, buttonSelector);
        await page.click(buttonSelector);
        await delay(2000);
        
        // Wait for dropdown menu
        const dropdownSelector = 'div.absolute.top-10.left-0.surface-1-background.on-surface-text.flex.transition-all.gap-4.z-30.shadow-2xl.rounded-lg.overflow-hidden';
        await waitForElement(page, dropdownSelector);
        
        // Get all main categories
        const mainCategories = await page.$$('div.flex.items-center.justify-between.cursor-pointer.hover\\:primary-text.label-large');
        console.log(`Found ${mainCategories.length} main categories`);
        
        for (const category of mainCategories) {
            try {
                const categoryName = await category.evaluate(el => el.textContent.trim());
                if (!categoryName) continue;
                
                console.log(`\nProcessing category: ${categoryName}`);
                
                // Hover over category to show subcategories
                await category.hover();
                await delay(1000);
                
                // Get subcategories
                const submenuSelector = 'div.flex.flex-col.gap-4.w-72.surface-1-background.p-5';
                await waitForElement(page, submenuSelector);
                
                const subcategoryLinks = await page.$$('div.flex.flex-col.gap-4.w-72.surface-1-background.p-5 a');
                const subcategoryList = [];
                
                for (const link of subcategoryLinks) {
                    const href = await link.evaluate(el => el.href);
                    const text = await link.evaluate(el => el.textContent.trim());
                    
                    if (href && text) {
                        const categoryId = href.includes('category_id=') ? 
                            href.split('category_id=')[1].split('&')[0] : null;
                        const categoryNameParam = href.includes('category_name=') ? 
                            href.split('category_name=')[1].split('&')[0] : null;
                        
                        subcategoryList.push({
                            title: text,
                            link: href,
                            category_id: categoryId,
                            category_name: categoryNameParam
                        });
                    }
                }
                
                if (subcategoryList.length > 0) {
                    categories.push({
                        title: categoryName,
                        subcategories: subcategoryList
                    });
                }
                
                // Move mouse away
                await page.mouse.move(0, 0);
                await delay(500);
                
            } catch (error) {
                console.error(`Error processing category: ${error.message}`);
                continue;
            }
        }
        
    } catch (error) {
        console.error(`Error extracting categories: ${error.message}`);
    }
    
    return categories;
}

async function saveCategoriestoJson(categories, filename = 'menu_structure.json') {
    try {
        await fs.writeJson(filename, { categories }, { spaces: 4 });
        console.log(`\nSuccessfully saved ${categories.length} categories to ${filename}`);
    } catch (error) {
        console.error(`Error saving categories to JSON: ${error.message}`);
    }
}

async function main() {
    let browser;
    try {
        console.log('\nInitializing Puppeteer...');
        const { browser: _browser, page } = await setupBrowser();
        browser = _browser;
        
        console.log('\nNavigating to main page...');
        await page.goto(BASE_URL);
        await delay(5000);
        
        const categories = await extractCategories(page);
        
        if (categories.length > 0) {
            await saveCategoriestoJson(categories);
        } else {
            console.log('No categories were extracted');
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