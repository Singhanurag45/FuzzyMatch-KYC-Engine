const express = require('express');
const path = require('path');
const { processRequest } = require('./services/screeningService');

const app = express();
app.use(express.json());

const PROJECT_ROOT = path.resolve(__dirname, '..');


app.get('/', (req, res) => {
  res.send('Backend is working fine.');
})

app.post('/process/:userId/:requestId', async (req, res) => {
  const { userId, requestId } = req.params;
  const logPrefix = req.body?.requestId || requestId;
  const bodyInput = req.body && (req.body.fullName != null || (Array.isArray(req.body.aliases) && req.body.aliases.length > 0))
    ? req.body
    : null;

  try {
    const result = await processRequest(userId, requestId, logPrefix, bodyInput);

    if (result.error) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.status(200).json({
      success: true,
      outputPath: result.outputDir,
      output: result.consolidated,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        requestId: logPrefix,
        message: 'Unhandled error in /process',
        error: err.message,
      })
    );
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      message: 'Mini Name Screening Service started',
      port: PORT,
      endpoint: `POST http://localhost:${PORT}/process/:userId/:requestId`,
    })
  );
});
