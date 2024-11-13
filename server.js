const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, uuidv4() + path.extname(file.originalname)); // UUID দ্বারা ফাইল নাম তৈরী হবে
    }
});

const upload = multer({ storage: storage });
app.use(express.static('public'));

// Sequential processing queue
let processingQueue = Promise.resolve();

// Process file upload
const processFileUpload = async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const svgFilePath = path.join(__dirname, 'uploads', req.file.filename);
    const outputDir = path.join(__dirname, 'uploads');
    const outputFileName = req.file.filename.replace('.svg', '.xml');
    const outputFilePath = path.join(outputDir, outputFileName);

    const heightDp = req.body.height ? `-heightDp ${req.body.height}` : '';
    const widthDp = req.body.width ? `-widthDp ${req.body.width}` : '';

    const command = `vd-tool -c -in ${svgFilePath} -out ${outputDir} ${heightDp} ${widthDp}`;

    try {
        await new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error during conversion: ${error.message}`);
                    reject('Error during conversion.');
                }
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                }
                resolve();
            });
        });

        fs.readFile(outputFilePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading the converted file:', err);
                return res.status(500).send('Error reading the converted file.');
            }
            res.send(data);
        });
    } catch (error) {
        console.error('Conversion failed:', error);
        res.status(500).send('Conversion failed.');
    }
};

// Endpoint to handle upload
app.post('/upload', upload.single('svg-file'), (req, res) => {
    // Store the file upload time as metadata in a JSON file
    const uploadTime = Date.now();
    const fileMetadata = {
        uuid: req.file.filename, // UUID filename
        uploadTime: uploadTime,   // Store the upload time
    };

    // Save metadata to a JSON file in the uploads directory
    const metadataFilePath = path.join(__dirname, 'uploads', req.file.filename + '.json');
    fs.writeFileSync(metadataFilePath, JSON.stringify(fileMetadata));

    processingQueue = processingQueue.then(() => processFileUpload(req, res));
});

// Function to delete files older than 10 minutes
const deleteOldFiles = () => {
    const uploadsDir = path.join(__dirname, 'uploads');
    const TEN_MINUTES = 10 * 60 * 1000; // 10 minutes in milliseconds

    fs.readdir(uploadsDir, (err, files) => {
        if (err) return console.error('Error reading directory:', err);

        files.forEach(file => {
            const filePath = path.join(uploadsDir, file);
            
            // Only process the JSON metadata files and the original files (not directories)
            if (file.endsWith('.json')) {
                fs.readFile(filePath, 'utf8', (err, data) => {
                    if (err) {
                        console.error('Error reading metadata file:', err);
                        return;
                    }

                    const metadata = JSON.parse(data);
                    const currentTime = Date.now();

                    // Check if the file is older than 10 minutes
                    if (currentTime - metadata.uploadTime > TEN_MINUTES) {
                        // Delete the original file
                        const originalFilePath = path.join(uploadsDir, metadata.uuid);
                        fs.unlink(originalFilePath, (err) => {
                            if (err) console.error(`Error deleting old file: ${originalFilePath}`, err);
                            else console.log(`Deleted old file: ${originalFilePath}`);
                        });

                        // Delete the associated metadata file
                        fs.unlink(filePath, (err) => {
                            if (err) console.error(`Error deleting metadata file: ${filePath}`, err);
                            else console.log(`Deleted metadata file: ${filePath}`);
                        });
                    }
                });
            }
        });
    });
};

// Run deleteOldFiles function every 10 minutes
setInterval(deleteOldFiles, 10 * 60 * 1000);

// Add '/clear' route to manually delete old files
app.post('/clear', (req, res) => {
    deleteOldFiles();  // Call the function to delete old files
    res.send('Old files cleared successfully');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
