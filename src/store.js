'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const QC_STATUSES = ['pending', 'passed', 'failed'];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS samples (
    id    TEXT PRIMARY KEY,
    owner TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id         TEXT PRIMARY KEY,
    sample_id  TEXT NOT NULL REFERENCES samples(id),
    filename   TEXT NOT NULL,
    qc_status  TEXT NOT NULL DEFAULT 'pending'
               CHECK (qc_status IN ('pending', 'passed', 'failed'))
  );
  CREATE INDEX IF NOT EXISTS idx_files_sample_id ON files(sample_id);

  CREATE TABLE IF NOT EXISTS access_grants (
    sample_id TEXT NOT NULL REFERENCES samples(id),
    user_id   TEXT NOT NULL,
    PRIMARY KEY (sample_id, user_id)
  );
`;

/**
 * Creates a store backed by SQLite.
 *
 * @param {string} dbPath - Path to the SQLite file, or ':memory:' for an
 *   isolated, ephemeral in-memory database. Defaults to ':memory:' so
 *   `createStore()` (as used throughout the test suite) gives every test
 *   its own fully isolated database with zero setup, mirroring how the
 *   original in-memory Map-based store worked.
 */
function createStore(dbPath = ':memory:') {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const stmts = {
    insertSample: db.prepare('INSERT INTO samples (id, owner) VALUES (?, ?)'),
    insertFile: db.prepare(
      "INSERT INTO files (id, sample_id, filename, qc_status) VALUES (?, ?, ?, 'pending')",
    ),
    getSample: db.prepare('SELECT id, owner FROM samples WHERE id = ?'),
    getSamples: db.prepare('SELECT id, owner FROM samples'),
    getFile: db.prepare(
      "SELECT id, sample_id AS sampleId, filename, qc_status AS qcStatus FROM files WHERE id = ? and qc_status = 'passed'",
    ),
    listFilesForSample: db.prepare(
      'SELECT id, sample_id AS sampleId, filename, qc_status AS qcStatus FROM files WHERE sample_id = ?',
    ),
    insertAccessGrant: db.prepare(
      'INSERT OR IGNORE INTO access_grants (sample_id, user_id) VALUES (?, ?)',
    ),
    getAccessGrant: db.prepare(
      'SELECT 1 FROM access_grants WHERE sample_id = ? AND user_id = ? LIMIT 1',
    ),
    updateFileQC: db.prepare(
      "UPDATE files SET qc_status = ? WHERE id = ? AND qc_status = 'pending'",
    ),
  };

  function createSample(owner, filenames = []) {
    const id = crypto.randomUUID();

    db.exec('BEGIN');
    try {
      stmts.insertSample.run(id, owner);
      const fileIds = filenames.map((filename) => {
        const fileId = crypto.randomUUID();
        stmts.insertFile.run(fileId, id, filename);
        return fileId;
      });
      db.exec('COMMIT');
      return { id, owner, fileIds };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function getSample(sampleId) {
    return stmts.getSample.get(sampleId) || null;
  }

  function getSamples() {
    return stmts.getSamples.all() || null;
  }


  function getFile(fileId) {
    return stmts.getFile.get(fileId) || null;
  }

  function listFilesForSample(sampleId) {
    return stmts.listFilesForSample.all(sampleId);
  }

  function grantAccess(sampleId, userId) {
    stmts.insertAccessGrant.run(sampleId, userId);
  }

  
  function hasAccess(sampleId, userId) {
    const sample = getSample(sampleId);
    if (!sample) return false;
    if (sample.owner === userId) return true;
    return Boolean(stmts.getAccessGrant.get(sampleId, userId));
  }

  
  function updateFileQC(fileId, status) {
    if (!QC_STATUSES.includes(status) || status === 'pending') {
      return { ok: false, reason: 'invalid_status' };
    }

    const result = stmts.updateFileQC.run(status, fileId);
    if (result.changes === 0) {
      const file = getFile(fileId);
      if (!file) return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'already_final', file };
    }

    return { ok: true, file: getFile(fileId) };
  }

  function close() {
    db.close();
  }

  return {
    createSample,
    getSample,
    getSamples,
    getFile,
    listFilesForSample,
    grantAccess,
    hasAccess,
    updateFileQC,
    close,
  };
}

module.exports = { createStore, QC_STATUSES };
