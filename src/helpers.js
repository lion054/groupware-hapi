const path = require('path');
const fs = require('fs');
const uuidv4 = require('uuid').v4;
const { db } = require('./server');

function acceptSingleFile(file, options) {
  const { destDir, fileFilter } = options;
  if (!file) {
    throw new Error('No file');
  }
  if (fileFilter && !fileFilter(file.hapi.filename)) {
    throw new Error('This file type is not allowed');
  }
  const fileName = uuidv4() + path.extname(file.hapi.filename);
  const filePath = path.join(destDir, fileName);
  const fileStream = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    const rx = /form-data; name=\"((?=[\S\s])[\S\s]*)\"; filename=\"((?=[\S\s])[\S\s]*)\"/;
    const matches = rx.exec(file.hapi.headers['content-disposition']);
    file.on('error', (err) => {
      reject(err);
    });
    file.pipe(fileStream);
    file.on('end', (err) => {
      const fileDetails = {
        fieldName: matches && matches[1],
        originalName: file.hapi.filename,
        fileName,
        mimeType: file.hapi.headers['content-type'],
        destination: options.destDir,
        filePath,
        fileSize: fs.statSync(filePath).size
      };
      resolve(fileDetails);
    });
  });
}

function acceptMultipleFiles(files, options) {
  if (!files || !Array.isArray(files)) {
    throw new Error('No files');
  }
  const promises = files.map(x => singleFileHandler(x, options));
  return Promise.all(promises);
}

module.exports = {
  hasCollection: async (name) => {
    const collections = await db.listCollections();
    const found = collections.find(x => x.name === name);
    return !!found;
  },
  checkUnique: async (collectionName, field, value, excludingKey = false) => {
    let query, bindVars;
    if (!excludingKey) {
      query = `
        FOR x IN ${collectionName}
        FILTER x.${field} == @value
        COLLECT WITH COUNT INTO length
        RETURN length
      `;
      bindVars = { value };
    } else {
      query = `
        FOR x IN ${collectionName}
        FILTER x.${field} == @value && x._key <> @excludingKey
        COLLECT WITH COUNT INTO length
        RETURN length
      `;
      bindVars = { value, excludingKey };
    }
    const cursor = await db.query({ query, bindVars });
    const result = await cursor.all();
    return result[0] === 0;
  },
  createNestedDirectory: (dirs) => {
    let dirPath = __dirname;
    for (const dir of dirs) {
      dirPath = path.join(dirPath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
      }
    }
    return dirPath;
  },
  deleteDirectory: (subDir) => {
    const dirPath = path.join(__dirname, subDir);
    if (fs.existsSync(dirPath)) {
      fs.rmdirSync(dirPath, {
        recursive: true
      });
    }
  },
  acceptFile: (file, options) => {
    return Array.isArray(file) ? acceptMultipleFiles(file, options) : acceptSingleFile(file, options);
  }
};
