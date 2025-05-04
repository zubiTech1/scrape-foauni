const { MongoClient } = require('mongodb');
const fs = require('fs/promises');
const winston = require('winston');

// MongoDB connection settings
const MONGO_URI = "mongodb+srv://pascalazubike100:yfiRzC02rO9HDwcl@cluster0.d62sy.mongodb.net/";
const DB_NAME = "abc_electronics";
const COLLECTION_NAME = "carousel";

// Set up logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} - ${level}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.File({ filename: 'carousel_upload.log' }),
        new winston.transports.Console()
    ]
});

class CarouselUploader {
    constructor() {
        this.client = null;
        this.db = null;
        this.collection = null;
    }

    async connect() {
        try {
            this.client = await MongoClient.connect(MONGO_URI);
            this.db = this.client.db(DB_NAME);
            this.collection = this.db.collection(COLLECTION_NAME);
            logger.info("Connected to MongoDB successfully");
        } catch (error) {
            logger.error(`MongoDB connection error: ${error.message}`);
            throw error;
        }
    }

    async ensureIndexes() {
        try {
            logger.info("\nDropping existing indexes...");
            await this.collection.dropIndexes();

            logger.info("Creating new indexes...");
            // Index on timestamp for sorting
            await this.collection.createIndex("timestamp");
            logger.info("Created index on 'timestamp'");

            // Index on category_id for filtering
            await this.collection.createIndex("params.category_id");
            logger.info("Created index on 'params.category_id'");

            logger.info("Index creation completed");
        } catch (error) {
            logger.error(`Error managing indexes: ${error.message}`);
        }
    }

    async uploadCarouselData(inputFile = 'carousel_data/carousel_images_with_cloudinary.json') {
        try {
            logger.info(`Reading carousel data from ${inputFile}`);
            
            // Read the carousel data
            const carouselData = JSON.parse(
                await fs.readFile(inputFile, 'utf-8')
            );
            
            logger.info(`Found ${carouselData.length} slides to process`);
            
            // Get existing slides from database for comparison
            const existingSlides = await this.collection.find({}, { projection: { _id: 0 } }).toArray();
            logger.info(`Found ${existingSlides.length} existing slides in database`);
            
            // Track metrics
            let updates = 0;
            let inserts = 0;
            let deletions = 0;
            
            // Process each slide
            const updateBatch = [];
            const insertBatch = [];
            
            // Keep track of processed URLs to identify stale entries
            const processedUrls = new Set();
            
            for (const slide of carouselData) {
                // Add last_updated timestamp
                slide.last_updated = new Date().toISOString();
                
                // Add URLs to processed set
                processedUrls.add(slide.desktop.url);
                processedUrls.add(slide.mobile.url);
                
                // Check if slide exists (based on image URLs)
                const existingSlide = existingSlides.find(s => 
                    s.desktop.url === slide.desktop.url && 
                    s.mobile.url === slide.mobile.url
                );
                
                if (existingSlide) {
                    // Slide exists - queue for update
                    updateBatch.push({
                        updateOne: {
                            filter: {
                                'desktop.url': slide.desktop.url,
                                'mobile.url': slide.mobile.url
                            },
                            update: { $set: slide }
                        }
                    });
                } else {
                    // New slide - queue for insert
                    insertBatch.push(slide);
                }
            }
            
            // Find and delete stale entries
            const staleSlides = existingSlides.filter(slide => 
                !processedUrls.has(slide.desktop.url) || 
                !processedUrls.has(slide.mobile.url)
            );
            
            if (staleSlides.length > 0) {
                logger.info(`Found ${staleSlides.length} stale slides to remove`);
                const deleteResult = await this.collection.deleteMany({
                    $or: staleSlides.map(slide => ({
                        'desktop.url': slide.desktop.url,
                        'mobile.url': slide.mobile.url
                    }))
                });
                deletions = deleteResult.deletedCount;
                logger.info(`Deleted ${deletions} stale slides`);
            }
            
            // Process batches
            if (updateBatch.length > 0) {
                await this.collection.bulkWrite(updateBatch);
                updates = updateBatch.length;
                logger.info(`Updated ${updates} slides`);
            }
            
            if (insertBatch.length > 0) {
                await this.collection.insertMany(insertBatch);
                inserts = insertBatch.length;
                logger.info(`Inserted ${inserts} new slides`);
            }
            
            logger.info("\nUpload Summary:");
            logger.info(`Updated: ${updates} slides`);
            logger.info(`Inserted: ${inserts} new slides`);
            logger.info(`Deleted: ${deletions} stale slides`);
            logger.info(`Total slides in database: ${await this.collection.countDocuments()}`);
            
            // Ensure indexes after upload
            await this.ensureIndexes();
            
        } catch (error) {
            logger.error(`An error occurred: ${error.message}`);
        } finally {
            // Close connection
            if (this.client) {
                await this.client.close();
                logger.info("MongoDB connection closed");
            }
        }
    }
}

// Run the uploader
async function main() {
    const uploader = new CarouselUploader();
    try {
        await uploader.connect();
        await uploader.uploadCarouselData();
    } catch (error) {
        logger.error(`Main process error: ${error.message}`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = CarouselUploader;