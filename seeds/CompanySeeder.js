const { CollectionType, Database } = require('arangojs');
const faker = require('faker');

module.exports = async function () {
  // create db connection
  const db = new Database({
    url: `http://${process.env.DB_HOST}:${process.env.DB_PORT}`,
    databaseName: process.env.DB_DATABASE,
    auth: {
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD
    }
  });

  // at the first, clean up old collection
  let collection = db.collection('companies');
  const found = await collection.exists();
  if (found) {
    await collection.drop();
  }

  // create new collection
  collection = db.collection('companies');
  await collection.create({
    type: CollectionType.DOCUMENT_COLLECTION
  });

  // create a few companies in this collection
  for (let i = 0; i < 3; i++) {
    const now = new Date().toISOString();
    await collection.save({
      name: faker.company.companyName(),
      since: faker.date.past(15),
      created_at: now,
      modified_at: now
    });
  }
}
