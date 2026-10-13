'use strict';
const fs = require('fs');
const path = require('path');

/** Persist JSON using a unique same-directory temp file and atomic rename. */
function atomicJsonWrite(filePath, value, options = {}) {
  const indent = Number.isInteger(options.indent) ? options.indent : 4;
  const validate = typeof options.validate === 'function' ? options.validate : null;
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const serialized = JSON.stringify(value, null, indent);
  if (typeof serialized !== 'string') throw new Error('Database value could not be serialized to JSON.');
  const parsed = JSON.parse(serialized);
  if (validate) {
    const validation = validate(parsed);
    if (validation !== true) throw new Error(typeof validation === 'string' ? validation : 'JSON validation failed; refusing to save.');
  }
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  let fd;
  try {
    fd = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(fd, serialized, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    // Same-directory rename is atomic on supported local filesystems.
    fs.renameSync(tempPath, filePath);
    // Best-effort directory sync helps persist the rename across a sudden restart.
    try {
      const dirFd = fs.openSync(directory, 'r');
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } catch (_) { /* Some platforms do not support syncing directory handles. */ }
    return { path: filePath, bytes: Buffer.byteLength(serialized, 'utf8') };
  } catch (error) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    throw error;
  }
}
module.exports = { atomicJsonWrite };
