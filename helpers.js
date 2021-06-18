const { db } = require('./server');

async function checkUnique(collectionName, field, value, excludingKey = false) {
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
}

module.exports = {
  checkUnique
};
