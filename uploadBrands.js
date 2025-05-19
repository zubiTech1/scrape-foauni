const fs = require('fs');
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb+srv://pascalazubike100:yfiRzC02rO9HDwcl@cluster0.d62sy.mongodb.net/';
const DB_NAME = 'abc_electronics';
const COLLECTION_NAME = 'brands';
const INPUT_FILE = 'brand_structure.json';

class BrandUploader {
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
            console.log('✅ Connected to MongoDB');
        } catch (error) {
            console.error(`❌ MongoDB connection error: ${error.message}`);
            throw error;
        }
    }

    async uploadBrands() {
        try {
            const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
            const parsed = JSON.parse(rawData);

            const brands = Array.isArray(parsed.brands) ? parsed.brands : [];

            if (!brands.length) {
                console.warn('⚠️ No brands found to upload');
                return;
            }

            let upserts = 0;
            for (const brand of brands) {
                if (!brand.title) {
                    console.warn('⚠️ Skipping brand with missing title:', brand);
                    continue;
                }

                await this.collection.updateOne(
                    { title: brand.title },
                    { $set: brand },
                    { upsert: true }
                );
                upserts++;
            }

            console.log(`✅ Successfully upserted ${upserts} brands`);

            await this.ensureIndexes();

        } catch (error) {
            console.error(`❌ Error uploading brand structure: ${error.message}`);
        } finally {
            await this.client.close();
            console.log('🔌 MongoDB connection closed');
        }
    }

    async ensureIndexes() {
        try {
            console.log('\n📦 Managing indexes...');
            await this.collection.dropIndexes();

            await this.collection.createIndex({ title: 1 }, { unique: true });
            console.log('✅ Index created on `title` field');
        } catch (error) {
            console.warn(`⚠️ Index error: ${error.message}`);
        }
    }
}

async function main() {
    const uploader = new BrandUploader();
    try {
        await uploader.connect();
        await uploader.uploadBrands();
    } catch (error) {
        console.error(`❌ Error in main: ${error.message}`);
    }
}

main();
