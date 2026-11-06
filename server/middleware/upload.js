const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ApiError } = require('./errorHandler');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); cb(null, UPLOAD_DIR); },
  // Random server-side name: the client-supplied filename is never used.
  filename: (req, file, cb) => cb(null, `${crypto.randomBytes(12).toString('hex')}${EXT[file.mimetype] || ''}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(new ApiError(400, 'Only JPEG, PNG or WebP images are allowed'))),
});

// Mime types can be spoofed, so also check the file's magic bytes.
function hasImageSignature(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const webp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  return jpeg || png || webp;
}

module.exports = { upload, hasImageSignature, UPLOAD_DIR };
