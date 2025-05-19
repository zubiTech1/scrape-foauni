const { MongoClient } = require('mongodb');

const { pipeline } = require('stream/promises');
const { createReadStream } = require('fs');
const JSONStream = require('JSONStream');

// MongoDB connection settings
const MONGO_URI = 'mongodb+srv://pascalazubike100:yfiRzC02rO9HDwcl@cluster0.d62sy.mongodb.net/';
const DB_NAME = 'abc_electronics';
const COLLECTION_NAME = 'products';

class ProductUploader {
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
            console.log('Connected to MongoDB successfully');
        } catch (error) {
            console.log(`MongoDB connection error: ${error.message}`);
            throw error;
        }
    }

    async ensureIndexes() {
        try {
            console.log('\nDropping existing indexes...');
            await this.collection.dropIndexes();

            console.log('Creating new indexes...');
            const indexes = [
                { key: { title: 1 } },
                { key: { sku: 1 } },
                { key: { main_category: 1 } },
                { key: { sub_category: 1 } },
                { key: { product_type: 1 } },
                { key: { availability: 1 } },
                { key: { deleted: 1 } }
            ];

            for (const index of indexes) {
                try {
                    await this.collection.createIndex(index.key);
                    console.log(`Created index on '${Object.keys(index.key)[0]}'`);
                } catch (error) {
                    console.log(`Error creating index: ${error.message}`);
                }
            }

            console.log('\nIndex creation completed');
        } catch (error) {
            console.log(`Error managing indexes: ${error.message}`);
        }
    }

    async uploadProducts(inputFile = 'products_updated_prices.json') {
        try {
            // Get existing SKUs
            const existingSkus = new Set(
                await this.collection
                    .find({}, { projection: { sku: 1 } })
                    .map(doc => doc.sku)
                    .toArray()
            );

            console.log(`Found ${existingSkus.size} existing products in database`);

            let updates = 0;
            let inserts = 0;
            let markedDeleted = 0;
            const processedSkus = new Set();
            const batchSize = 1000;
            let updateBatch = [];
            let insertBatch = [];

            // Process products in streaming mode
            const parser = JSONStream.parse('*');
            await pipeline(
                createReadStream(inputFile),
                parser,
                async function* (source) {
                    for await (const product of source) {
                        const { sku } = product;
                        if (!sku) continue;

                        processedSkus.add(sku);
                        product.deleted = false;

                        if (existingSkus.has(sku)) {
                            updateBatch.push({
                                updateOne: {
                                    filter: { sku },
                                    update: { $set: product }
                                }
                            });
                        } else {
                            insertBatch.push(product);
                        }

                        // Process batches
                        if (updateBatch.length >= batchSize) {
                            await this.collection.bulkWrite(updateBatch);
                            updates += updateBatch.length;
                            console.log(`Updated ${updates} products so far`);
                            updateBatch = [];
                        }

                        if (insertBatch.length >= batchSize) {
                            await this.collection.insertMany(insertBatch);
                            inserts += insertBatch.length;
                            console.log(`Inserted ${inserts} new products so far`);
                            insertBatch = [];
                        }
                    }
                }
            );

            // Process remaining batches
            if (updateBatch.length) {
                await this.collection.bulkWrite(updateBatch);
                updates += updateBatch.length;
            }

            if (insertBatch.length) {
                await this.collection.insertMany(insertBatch);
                inserts += insertBatch.length;
            }

            // Mark deleted products
            const skusToMarkDeleted = [...existingSkus].filter(sku => !processedSkus.has(sku));
            if (skusToMarkDeleted.length) {
                const result = await this.collection.updateMany(
                    { sku: { $in: skusToMarkDeleted } },
                    { $set: { deleted: true } }
                );
                markedDeleted = result.modifiedCount;
            }

            // Print summary
            console.log('\nSync Complete:');
            console.log(`Updated: ${updates} products`);
            console.log(`Inserted: ${inserts} new products`);
            console.log(`Marked as deleted: ${markedDeleted} products`);

            const stats = await Promise.all([
                this.collection.countDocuments({}),
                this.collection.countDocuments({ deleted: false }),
                this.collection.countDocuments({ deleted: true })
            ]);

            console.log(`Total products in database: ${stats[0]}`);
            console.log(`Active products: ${stats[1]}`);
            console.log(`Deleted products: ${stats[2]}`);

            // Ensure indexes
            await this.ensureIndexes();

        } catch (error) {
            console.log(`Error uploading products: ${error.message}`);
        } finally {
            await this.client.close();
            console.log('MongoDB connection closed');
        }
    }
}

async function main() {
    const uploader = new ProductUploader();
    try {
        await uploader.connect();
        await uploader.uploadProducts();
    } catch (error) {
        console.log(`Error in main: ${error.message}`);
    }
}

main();