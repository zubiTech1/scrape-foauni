const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
const { URL } = require('url');

// Configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => 
            `${timestamp} - ${level}: ${message}`
        )
    ),
    transports: [
        new winston.transports.File({ filename: 'carousel_scraper.log' }),
        new winston.transports.Console()
    ]
});

class WebDriverManager {
    constructor() {
        this.browser = null;
    }

    async initBrowser() {
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
        return this.browser;
    }

    async cleanup() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
        } catch (error) {
            logger.error(`Error cleaning up browser: ${error.message}`);
        }
    }
}

class CarouselScraper {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.carouselData = [];
        this.outputDir = 'carousel_data';
        this.outputFile = path.join(this.outputDir, 'carousel_images.json');
        this.driverManager = new WebDriverManager();
    }

    extractImageUrl(srcset) {
        try {
            if (!srcset) return null;

            const urls = srcset.split(',').map(src => {
                const [url] = src.trim().split(' ');
                if (url.startsWith('/_next/image')) {
                    const urlObj = new URL(url, this.baseUrl);
                    const originalUrl = urlObj.searchParams.get('url');
                    return originalUrl ? decodeURIComponent(originalUrl) : null;
                }
                return null;
            }).filter(Boolean);

            return urls[urls.length - 1] || null;
        } catch (error) {
            logger.error(`Error extracting image URL: ${error.message}`);
            return null;
        }
    }

    extractLinkParams(link) {
        try {
            if (!link) return {};
            
            const url = new URL(link, this.baseUrl);
            const params = {};
            
            for (const [key, value] of url.searchParams) {
                params[key] = value;
            }
            
            return params;
        } catch (error) {
            logger.error(`Error parsing link parameters: ${error.message}`);
            return {};
        }
    }

    async scrapeCarousel() {
        try {
            const browser = await this.driverManager.initBrowser();
            const page = await browser.newPage();
            
            logger.info(`Starting to scrape carousel from ${this.baseUrl}`);
            await page.goto(this.baseUrl);
            
            const carouselWrapper = await page.$('.swiper-wrapper');
            if (!carouselWrapper) {
                logger.warn('Carousel wrapper not found');
                return;
            }

            const slides = await carouselWrapper.$$('.swiper-slide');
            if (!slides.length) {
                logger.warn('No carousel slides found');
                return;
            }

            for (const slide of slides) {
                try {
                    const desktopImg = await slide.$('a.hidden.lg\\:block img');
                    const mobileImg = await slide.$('a.block.lg\\:hidden img');

                    if (!desktopImg || !mobileImg) {
                        logger.warn('Missing images in carousel slide');
                        continue;
                    }

                    const link = await slide.$eval('a', el => el.href);
                    const linkParams = this.extractLinkParams(link);

                    const slideData = {
                        desktop: {
                            url: await desktopImg.evaluate(img => img.srcset).then(srcset => this.extractImageUrl(srcset)),
                            alt: await desktopImg.evaluate(img => img.alt || ''),
                            title: await desktopImg.evaluate(img => img.title || ''),
                            aspect_ratio: '3:1'
                        },
                        mobile: {
                            url: await mobileImg.evaluate(img => img.srcset).then(srcset => this.extractImageUrl(srcset)),
                            alt: await mobileImg.evaluate(img => img.alt || ''),
                            title: await mobileImg.evaluate(img => img.title || ''),
                            aspect_ratio: '9:16'
                        },
                        params: linkParams,
                        raw_link: link,
                        timestamp: new Date().toISOString()
                    };

                    if (slideData.desktop.url && slideData.mobile.url) {
                        this.carouselData.push(slideData);
                        logger.info('Successfully scraped desktop and mobile images from carousel slide');
                    } else {
                        logger.warn('Failed to extract image URLs from carousel slide');
                    }
                } catch (error) {
                    logger.error(`Error processing carousel slide: ${error.message}`);
                    continue;
                }
            }

            await this.saveData();
            logger.info('Carousel scraping completed successfully');

        } catch (error) {
            logger.error(`Error scraping carousel: ${error.message}`);
        } finally {
            await this.driverManager.cleanup();
        }
    }

    async saveData() {
        try {
            await fs.mkdir(this.outputDir, { recursive: true });
            await fs.writeFile(
                this.outputFile,
                JSON.stringify(this.carouselData, null, 2),
                'utf8'
            );
            logger.info(`Data saved to ${this.outputFile}`);
        } catch (error) {
            logger.error(`Error saving data: ${error.message}`);
        }
    }
}

// Handle cleanup on process termination
process.on('SIGTERM', async () => {
    logger.info('Received shutdown signal, cleaning up...');
    if (global.scraper) {
        await global.scraper.driverManager.cleanup();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('Received interrupt signal, cleaning up...');
    if (global.scraper) {
        await global.scraper.driverManager.cleanup();
    }
    process.exit(0);
});

// Main execution
async function main() {
    try {
        const baseUrl = 'https://fouanistore.com';
        global.scraper = new CarouselScraper(baseUrl);
        await global.scraper.scrapeCarousel();
    } catch (error) {
        logger.error(`Error in main: ${error.message}`);
    } finally {
        if (global.scraper) {
            await global.scraper.driverManager.cleanup();
        }
    }
}

main();