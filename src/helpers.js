const neo4j = require("neo4j-driver");
const moment = require("moment");
const path = require("path");
const fs = require("fs");
const uuidv4 = require("uuid").v4;
const { db } = require("./server");

function acceptSingleFile(file, options) {
  const { destDir, fileFilter } = options;
  if (!file) {
    throw new Error("No file");
  }
  if (fileFilter && !fileFilter(file.hapi.filename)) {
    throw new Error("This file type is not allowed");
  }
  const fileName = uuidv4() + path.extname(file.hapi.filename);
  const filePath = path.join(destDir, fileName);
  const fileStream = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    const rx = /form-data; name=\"((?=[\S\s])[\S\s]*)\"; filename=\"((?=[\S\s])[\S\s]*)\"/;
    const matches = rx.exec(file.hapi.headers["content-disposition"]);
    file.on("error", (err) => {
      reject(err);
    });
    file.pipe(fileStream);
    file.on("end", (err) => {
      const fileDetails = {
        fieldName: matches && matches[1],
        originalName: file.hapi.filename,
        fileName,
        mimeType: file.hapi.headers["content-type"],
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
    throw new Error("No files");
  }
  const promises = files.map(x => singleFileHandler(x, options));
  return Promise.all(promises);
}

module.exports = {
  parseRecord: (record, excludingField) => {
    const result = {};
    for (let [key, node] of record.entries()) {
      result[key] = {
        id: node.identity.toString()
      };
      for (let field in node.properties) {
        if (!!excludingField) {
          if (field === excludingField) {
            continue;
          }
        }
        const value = node.properties[field];
        if (neo4j.isDate(value)) {
          result[key][field] = value.toString();
        } else if (neo4j.isTime(value) || neo4j.isDateTime(value)) {
          result[key][field] = moment(value.toString()).format(); // convert nanoseconds to microseconds
        } else {
          result[key][field] = value;
        }
      }
    }
    return result;
  },
  checkUnique: async (label, field, value, excludingId = false) => {
    if (!excludingId) {
      const { records } = await db.run(`
        MATCH (n:${label})
        WHERE n.${field} = $value
        RETURN count(*)
      `, { value });
      const count = records[0].get(0);
      return neo4j.integer.toNumber(count) === 0;
    } else {
      const { records } = await db.run(`
        MATCH (n:${label})
        WHERE n.${field} = $value AND id(n) <> $excludingId
        RETURN count(*)
      `, {
        value,
        excludingId: neo4j.int(excludingId)
      });
      const count = records[0].get(0);
      return neo4j.integer.toNumber(count) === 0;
    }
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
