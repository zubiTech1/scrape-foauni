const fs = require('fs');
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb+srv://pascalazubike100:yfiRzC02rO9HDwcl@cluster0.d62sy.mongodb.net/';
const DB_NAME = 'abc_electronics';
const COLLECTION_NAME = 'carousel';
const INPUT_FILE = 'carousel_banners.json';

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
            console.log('✅ Connected to MongoDB');
        } catch (error) {
            console.error(`❌ MongoDB connection error: ${error.message}`);
            throw error;
        }
    }

    async uploadBanners() {
        try {
            const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
            const parsed = JSON.parse(rawData);

            const banners = Array.isArray(parsed.banners) ? parsed.banners : [];

            if (!banners.length) {
                console.warn('⚠️ No banners found to upload');
                return;
            }

            let upserts = 0;
            for (const banner of banners) {
                if (!banner.id) {
                    console.warn('⚠️ Skipping banner with missing ID:', banner);
                    continue;
                }

                await this.collection.updateOne(
                    { id: banner.id },
                    { $set: banner },
                    { upsert: true }
                );
                upserts++;
            }

            console.log(`✅ Successfully upserted ${upserts} carousel banners`);

            await this.ensureIndexes();

        } catch (error) {
            console.error(`❌ Error uploading carousel banners: ${error.message}`);
        } finally {
            await this.client.close();
            console.log('🔌 MongoDB connection closed');
        }
    }

    async ensureIndexes() {
        try {
            console.log('\n🔧 Managing indexes...');
            await this.collection.dropIndexes();

            await this.collection.createIndex({ id: 1 }, { unique: true });
            console.log('✅ Index created on `id` field');
        } catch (error) {
            console.warn(`⚠️ Index error: ${error.message}`);
        }
    }
}

async function main() {
    const uploader = new CarouselUploader();
    try {
        await uploader.connect();
        await uploader.uploadBanners();
    } catch (error) {
        console.error(`❌ Error in main: ${error.message}`);
    }
}

main();
