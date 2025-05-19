const fs = require('fs');
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb+srv://pascalazubike100:yfiRzC02rO9HDwcl@cluster0.d62sy.mongodb.net/';
const DB_NAME = 'abc_electronics';
const COLLECTION_NAME = 'categories';
const INPUT_FILE = 'menu_structure.json';

class MenuUploader {
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

    async uploadMenu() {
        try {
            const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
            const parsed = JSON.parse(rawData);

            const categories = Array.isArray(parsed.categories) ? parsed.categories : [];

            if (!categories.length) {
                console.warn('⚠️ No categories found to upload');
                return;
            }

            let upserts = 0;
            for (const category of categories) {
                if (!category.title) {
                    console.warn('⚠️ Skipping category with missing title:', category);
                    continue;
                }

                await this.collection.updateOne(
                    { title: category.title },
                    { $set: category },
                    { upsert: true }
                );
                upserts++;
            }

            console.log(`✅ Successfully upserted ${upserts} categories`);

            await this.ensureIndexes();

        } catch (error) {
            console.error(`❌ Error uploading menu structure: ${error.message}`);
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
    const uploader = new MenuUploader();
    try {
        await uploader.connect();
        await uploader.uploadMenu();
    } catch (error) {
        console.error(`❌ Error in main: ${error.message}`);
    }
}

main();
