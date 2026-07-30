const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { saveUploadedFileToStorage } = require('../src/controllers/documentController.js');

test('writes uploaded files to local storage when external storage is unavailable', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clickor-doc-'));
  const savedPath = await saveUploadedFileToStorage(
    Buffer.from('hello from upload test'),
    { originalname: 'sample.txt', mimetype: 'text/plain' },
    { storageRoot: tempDir }
  );

  assert.ok(savedPath, 'expected a saved file path');
  assert.equal(fs.readFileSync(savedPath, 'utf8'), 'hello from upload test');
  fs.rmSync(tempDir, { recursive: true, force: true });
});
