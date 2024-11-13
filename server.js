const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process'); // To execute vd-tool command
const fs = require('fs');

const app = express();
const port = 3000;

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configure multer to save uploaded files in the 'uploads' directory
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique filename based on timestamp
    }
});

const upload = multer({ storage: storage });

// Serve static files (HTML, CSS) from 'public' folder
app.use(express.static('public'));

// Sequential request queue for processing one request at a time
let processingQueue = Promise.resolve();

// Function to process each file upload request
const processFileUpload = async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const svgFilePath = path.join(__dirname, 'uploads', req.file.filename);
    const outputDir = path.join(__dirname, 'uploads');
    const outputFileName = req.file.filename.replace('.svg', '.xml');
    const outputFilePath = path.join(outputDir, outputFileName);

    // Get height and width from the request body, if available
    const heightDp = req.body.height ? `-heightDp ${req.body.height}` : '';
    const widthDp = req.body.width ? `-widthDp ${req.body.width}` : '';

    // Run vd-tool to convert the SVG file to VectorDrawable XML
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

        // Read the generated XML file and send it as response
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

// Endpoint to handle the file upload and conversion
app.post('/upload', upload.single('svg-file'), (req, res) => {
    // Queue each request to process one at a time
    processingQueue = processingQueue.then(() => processFileUpload(req, res));
});

// For clearing the inputs and output text area when user clicks "clear"
app.post('/clear', (req, res) => {
    fs.readdir('uploads', (err, files) => {
        if (err) return res.status(500).send('Error clearing uploads.');
        
        files.forEach(file => {
            fs.unlink(path.join('uploads', file), err => {
                if (err) console.log(`Error deleting file: ${file}`);
            });
        });
    });
    res.send('Cleared');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});    if (err) console.log(`Error deleting file: ${file}`);
            });
        });
    });
    res.send('Cleared');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
