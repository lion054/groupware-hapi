const neo4j = require("neo4j-driver");
const moment = require("moment");
const path = require("path");
const fs = require("fs");
const uuidv4 = require("uuid").v4;
const request = require("request");
const { createNestedDirectory } = require("../src/helpers");

function sleep(duration) {
  return new Promise(resolve => {
    setTimeout(() => resolve(), duration);
  });
}

module.exports = {
  parseRecord: (record) => {
    const result = {};
    for (let key of record.keys) {
      const value = record.get(key);
      if (neo4j.isDate(value)) {
        result[key] = value.toString();
      } else if (neo4j.isTime(value) || neo4j.isDateTime(value)) {
        result[key] = moment(value.toString()).format(); // convert nanoseconds to microseconds
      } else {
        result[key] = value;
      }
    }
    return result;
  },
  downloadImage: async (collectionName, key) => {
    const dirPath = createNestedDirectory(["..", "storage", collectionName, key]);
    const fileName = uuidv4() + ".jpg";
    const filePath = path.join(dirPath, fileName);
    const response = await request("https://thispersondoesnotexist.com/image");
    response.pipe(fs.createWriteStream(filePath));
    await sleep(1000); // hack: avoid downloading of same image at the differnet time
    return fileName;
  }
}
