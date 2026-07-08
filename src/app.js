const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { createStore } = require('./store');

const app = express();
app.use(express.json());


const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'samples.db');

const store = createStore(DB_PATH);


app.get('/test', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

app.get('/getsamples', (req, res) => {
     const sample = store.getSamples();
     if (!sample) return res.status(404).json({ error: 'samples empty' });
  return res.json(sample);
});


// 1. Register a sample
app.post('/samples', (req, res) => {
    const { owner, files } = req.body || {};

    if (!owner || typeof owner !== 'string') {
      return res.status(400).json({ error: 'owner is required and must be a string' });
    }
    if (files !== undefined) {
      const isValid = Array.isArray(files) && files.every((f) => typeof f === 'string' && f.length > 0);
      if (!isValid) {
        return res.status(400).json({ error: 'files must be an array of filename strings' });
      }
    }

    const sample = store.createSample(owner, files || []);
    return res.status(201).json(serializeSample(sample, store));
  });

// 2. Grant a user access 
app.post('/samples/access/:sampleId', (req, res) => {
    const { userId } = req.body || {};
    const sample = store.getSample(req.params.sampleId);
    if (!sample) return res.status(404).json({ error: 'sample not found' });
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required via request_body and must be a string' });
    }

    store.grantAccess(sample.id, userId);
    return res.status(201).json({ sampleId: sample.id, userId });
  });

//3. A QC callback modifies the QC status  
 app.post('/files/qc/:fileId', (req, res) => {
    const { status } = req.body || {};
    if (status !== 'passed' && status !== 'failed') {
      return res.status(400).json({ error: 'status must be "passed" or "failed"' });
    }

    const file = store.getFile(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'file not found' });

    const result = store.updateFileQC(req.params.fileId, status);
    if (!result.ok) {
      return res.status(409).json({
        error: `file QC status wrong (${result.file.qcStatus})`,
      });
    }

    return res.json({ id: result.file.id, qcStatus: result.file.qcStatus });
  });
// 4. A download-request
  app.post('/download-request', (req, res) => {
    const { userId, fileId } = req.body || {};
    if (!userId || !fileId) {
      return res.status(400).json({ error: 'userId and fileId are required' });
    }

    const file = store.getFile(fileId);
    if (!file) return res.status(404).json({ error: 'file not found' });

    if (!store.hasAccess(file.sampleId, userId)) {
      return res.status(403).json({ error: 'user is not permitted to access this file' });
    }

    if (file.qcStatus !== 'passed') {
      return res.status(403).json({
        error: `file has not passed QC (current status: ${file.qcStatus})`,
      });
    }

    return res.json(generateFakeDownloadUrl(file));
  });

/*---------------------------------------------------------------------------------------------------------*/ 
function serializeSample(sample, store) {
  return {
    id: sample.id,
    owner: sample.owner,
    files: store.listFilesForSample(sample.id).map((f) => ({
      id: f.id,
      filename: f.filename,
      qcStatus: f.qcStatus,
    })),
  };
}

module.exports = app;