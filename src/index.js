'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

function normalizePackageName(name) {
  return String(name || '').trim();
}

function files(name, opts = {}) {
  const emitter = new EventEmitter();
  const pkgName = normalizePackageName(name);

  if (!pkgName) {
    process.nextTick(() => {
      emitter.emit('error', new Error('A package name is required.'));
    });
    return emitter;
  }

  const baseDir = opts.cwd || process.cwd();
  const packagePath = path.join(baseDir, 'node_modules', pkgName);

  process.nextTick(() => {
    try {
      if (!fs.existsSync(packagePath)) {
        throw new Error(`Package "${pkgName}" was not found in ${baseDir}`);
      }

      const packageJsonPath = path.join(packagePath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error(`Package "${pkgName}" does not contain a package.json file.`);
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const filesToRead = [];
      const walk = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') {
              continue;
            }
            walk(fullPath);
            continue;
          }

          filesToRead.push({
            path: path.relative(packagePath, fullPath),
            fullPath,
            size: fs.statSync(fullPath).size,
            mtime: fs.statSync(fullPath).mtime,
            props: {
              path: path.relative(packagePath, fullPath),
              size: fs.statSync(fullPath).size,
              mtime: fs.statSync(fullPath).mtime,
              cksum: undefined,
            },
          });
        }
      };

      walk(packagePath);

      filesToRead
        .sort((a, b) => a.path.localeCompare(b.path))
        .forEach((file) => {
          const stream = fs.createReadStream(file.fullPath);
          stream.on('data', (chunk) => {
            // A stream is emitted as a readable object to be consumed by the caller.
            const payload = {
              ...file,
              stream,
              contents: chunk,
            };
            emitter.emit('file', payload);
          });
          stream.on('error', (error) => emitter.emit('error', error));
          stream.on('end', () => {
            // No-op, the consumer decides how to read the stream.
          });
        });

      emitter.emit('end');
    } catch (error) {
      emitter.emit('error', error);
    }
  });

  return emitter;
}

module.exports = files;
module.exports.files = files;
