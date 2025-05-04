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
let carouselProcess = null;
let isCarouselRunning = false;

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

app.get('/carousel', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'carousel.html'));
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
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendProgress = () => {
        while (progressQueue.length > 0) {
            const message = progressQueue.shift();
            res.write(`data: ${JSON.stringify({ message })}\n\n`);
        }
    };

    const progressInterval = setInterval(sendProgress, 1000);

    req.on('close', () => {
        clearInterval(progressInterval);
    });
});

// Carousel routes
app.get('/carousel/check-process', (req, res) => {
    res.json({ status: isCarouselRunning ? 'running' : 'stopped' });
});

app.post('/carousel/start-process', (req, res) => {
    if (isCarouselRunning) {
        return res.json({ status: 'error', message: 'Process already running' });
    }

    try {
        isCarouselRunning = true;
        runCarouselProcess();
        res.json({ status: 'started' });
    } catch (error) {
        isCarouselRunning = false;
        res.json({ status: 'error', message: error.message });
    }
});

app.post('/carousel/stop-process', (req, res) => {
    if (!isCarouselRunning) {
        return res.json({ status: 'error', message: 'No process running' });
    }

    try {
        if (carouselProcess) {
            carouselProcess.kill();
        }
        isCarouselRunning = false;
        res.json({ status: 'stopped' });
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

app.get('/carousel/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendProgress = () => {
        while (carouselProgressQueue.length > 0) {
            const message = carouselProgressQueue.shift();
            res.write(`data: ${JSON.stringify({ message })}\n\n`);
        }
    };

    const progressInterval = setInterval(sendProgress, 1000);

    req.on('close', () => {
        clearInterval(progressInterval);
    });
});

// Process runners
function runScrapingProcess() {
    const steps = [
        { script: 'category.js', message: 'Starting category scraping...' },
        { script: 'scrape.js', message: 'Starting product scraping...' },
        { script: 'update_prices.js', message: 'Starting price updates...' },
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

function runCarouselProcess() {
    const steps = [
        { script: 'scrape_carousel.js', message: 'Starting carousel scraping...' },
        { script: 'upload_carousel-image_to_cloudinary.js', message: 'Starting Cloudinary upload...' },
        { script: 'upload_carousel_to_db.js', message: 'Starting database upload...' }
    ];

    let currentStep = 0;

    function runStep() {
        if (currentStep >= steps.length || !isCarouselRunning) {
            carouselProgressQueue.push('All carousel operations completed successfully!');
            isCarouselRunning = false;
            return;
        }

        const { script, message } = steps[currentStep];
        carouselProgressQueue.push(message);

        const process = spawn('node', [script]);

        process.stdout.on('data', (data) => {
            carouselProgressQueue.push(data.toString().trim());
        });

        process.stderr.on('data', (data) => {
            carouselProgressQueue.push(`Error: ${data.toString().trim()}`);
        });

        process.on('close', (code) => {
            if (code === 0) {
                currentStep++;
                runStep();
            } else {
                carouselProgressQueue.push(`Error in ${script}`);
                isCarouselRunning = false;
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