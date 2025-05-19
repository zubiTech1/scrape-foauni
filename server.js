const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const winston = require('winston');
const findProcess = require('find-process');

const app = express();

// Configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Serve static files
app.use(express.static('templates'));
app.use(express.json());

// Store process states and queues
let scrapingProcess = null;
let isScrapingRunning = false;


const progressQueue = [];
const carouselProgressQueue = [];

// Clean up Chrome processes
async function cleanupChromeProcesses() {
    try {
        const processes = await findProcess('name', 'chrome');
        for (const proc of processes) {
            if (proc.cmd && proc.cmd.includes('--remote-debugging-port')) {
                process.kill(proc.pid);
                logger.info(`Killed Chrome process: ${proc.pid}`);
            }
        }
    } catch (error) {
        logger.error('Error cleaning up Chrome processes:', error);
    }
}

// Clean up on exit
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

async function cleanup() {
    try {
        if (scrapingProcess) {
            scrapingProcess.kill();
        }
        if (carouselProcess) {
            carouselProcess.kill();
        }
        await cleanupChromeProcesses();
        isScrapingRunning = false;
        isCarouselRunning = false;
        logger.info('Cleanup completed successfully');
    } catch (error) {
        logger.error('Error during cleanup:', error);
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});



app.get('/check-process', (req, res) => {
    res.json({ status: isScrapingRunning ? 'running' : 'stopped' });
});

app.post('/start-process', (req, res) => {
    if (isScrapingRunning) {
        return res.json({ status: 'error', message: 'Process already running' });
    }

    try {
        isScrapingRunning = true;
        runScrapingProcess();
        res.json({ status: 'started' });
    } catch (error) {
        isScrapingRunning = false;
        res.json({ status: 'error', message: error.message });
    }
});

app.post('/stop-process', (req, res) => {
    if (!isScrapingRunning) {
        return res.json({ status: 'error', message: 'No process running' });
    }

    try {
        if (scrapingProcess) {
            scrapingProcess.kill();
        }
        cleanupChromeProcesses();
        isScrapingRunning = false;
        res.json({ status: 'stopped' });
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// SSE endpoint for progress updates
app.get('/progress', (req, res) => {
    try {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send initial connection message
        res.write('data: {"message": "Connected to event stream"}\n\n');
        logger.info('Client connected to progress stream');

        const sendProgress = () => {
            try {
                while (progressQueue.length > 0) {
                    const message = progressQueue.shift();
                    res.write(`data: ${JSON.stringify({ message })}\n\n`);
                    logger.info(`Progress sent: ${message}`);
                }
            } catch (error) {
                logger.error('Error in sendProgress:', error);
                res.write(`data: ${JSON.stringify({ message: `Error sending progress: ${error.message}` })}\n\n`);
            }
        };

        const progressInterval = setInterval(sendProgress, 1000);

        req.on('close', () => {
            try {
                clearInterval(progressInterval);
                logger.info('Client disconnected from progress stream');
            } catch (error) {
                logger.error('Error clearing interval:', error);
            }
        });
    } catch (error) {
        logger.error('Error in progress endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// Process runners
function runScrapingProcess() {
    const steps = [
        { script: 'scrape.js', message: 'Starting product scraping...' },
        { script: 'update_prices.js', message: 'Starting price updates...' },
        { script: 'fetchCarouselBanners.js', message: 'Starting Carousel scraping' },
        { script: 'category.js', message: 'Starting category scraping...' },
        { script: 'fetchBrand.js', message: 'Starting Branding scraping...' },
        { script: 'uploadMenuStructure.js', message: 'Starting category upload to database...' },
        { script: 'uploadCarouselBanners.js', message: 'Starting database upload...' },
        { script: 'uploadBrands.js', message: 'Starting product Brand uploadt to database...' },
        { script: 'upload_products_streaming.js', message: 'Starting database upload...' }
    ];

    let currentStep = 0;

    function runStep() {
        if (currentStep >= steps.length || !isScrapingRunning) {
            progressQueue.push('All operations completed successfully!');
            isScrapingRunning = false;
            return;
        }

        const { script, message } = steps[currentStep];
        progressQueue.push(message);

        const process = spawn('node', [script]);

        process.stdout.on('data', (data) => {
            progressQueue.push(data.toString().trim());
        });

        process.stderr.on('data', (data) => {
            progressQueue.push(`Error: ${data.toString().trim()}`);
        });

        process.on('close', (code) => {
            if (code === 0) {
                currentStep++;
                runStep();
            } else {
                progressQueue.push(`Error in ${script}`);
                isScrapingRunning = false;
            }
        });
    }

    runStep();
}



// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});