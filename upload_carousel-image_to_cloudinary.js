require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { createLogger, format, transports } = require('winston');

// Configure logger
const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message }) => `${timestamp} - ${level}: ${message}`)
    ),
    transports: [
        new transports.File({ filename: 'cloudinary_upload.log' }),
        new transports.Console()
    ]
});

class CloudinaryUploader {
    constructor(cloudName, uploadPreset) {
        this.cloudName = cloudName;
        this.uploadPreset = uploadPreset;
        this.uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
        
        logger.info(`Initialized Cloudinary uploader with cloud name: ${cloudName}`);
    }
    
    async uploadImage(imageUrl) {
        try {
            logger.info(`Attempting to upload image: ${imageUrl}`);
            
            // Prepare the upload data
            const data = {
                file: imageUrl,
                upload_preset: this.uploadPreset
            };
            
            // Make the upload request
            logger.info('Sending upload request to Cloudinary...');
            const response = await axios.post(this.uploadUrl, data);
            
            const cloudinaryUrl = response.data.secure_url;
            logger.info(`Successfully uploaded image to Cloudinary: ${cloudinaryUrl}`);
            return cloudinaryUrl;
            
        } catch (error) {
            logger.error(`Failed to upload image ${imageUrl}: ${error.message}`);
            return null;
        }
    }
    
    async processCarouselData(inputFile, outputFile) {
        try {
            logger.info(`Reading carousel data from ${inputFile}`);
            const carouselData = JSON.parse(await fs.readFile(inputFile, 'utf8'));
            
            logger.info(`Found ${carouselData.length} slides to process`);
            
            let successfulUploads = 0;
            let failedUploads = 0;
            
            for (const [index, slide] of carouselData.entries()) {
                logger.info(`\nProcessing slide ${index + 1}/${carouselData.length}`);
                
                if (slide.desktop?.url) {
                    logger.info('Processing desktop image...');
                    const cloudinaryUrl = await this.uploadImage(slide.desktop.url);
                    if (cloudinaryUrl) {
                        slide.desktop.cloudinary_url = cloudinaryUrl;
                        successfulUploads++;
                    } else {
                        failedUploads++;
                    }
                }
                
                if (slide.mobile?.url) {
                    logger.info('Processing mobile image...');
                    const cloudinaryUrl = await this.uploadImage(slide.mobile.url);
                    if (cloudinaryUrl) {
                        slide.mobile.cloudinary_url = cloudinaryUrl;
                        successfulUploads++;
                    } else {
                        failedUploads++;
                    }
                }
            }
            
            logger.info(`\nSaving updated data to ${outputFile}`);
            await fs.writeFile(outputFile, JSON.stringify(carouselData, null, 2));
            
            logger.info('\nUpload Summary:');
            logger.info(`Total images processed: ${successfulUploads + failedUploads}`);
            logger.info(`Successfully uploaded: ${successfulUploads}`);
            logger.info(`Failed uploads: ${failedUploads}`);
            logger.info(`Updated data saved to: ${outputFile}`);
            
        } catch (error) {
            logger.error(`Error processing carousel data: ${error.message}`);
        }
    }
}

if (require.main === module) {
    const CLOUD_NAME = 'dztt3ldiy';
    const UPLOAD_PRESET = 'ml_default';
    const INPUT_FILE = path.join('carousel_data', 'carousel_images.json');
    const OUTPUT_FILE = path.join('carousel_data', 'carousel_images_with_cloudinary.json');
    
    logger.info('Starting Cloudinary upload process...');
    
    const uploader = new CloudinaryUploader(CLOUD_NAME, UPLOAD_PRESET);
    uploader.processCarouselData(INPUT_FILE, OUTPUT_FILE)
        .finally(() => logger.info('Process completed!'));
}

module.exports = CloudinaryUploader;