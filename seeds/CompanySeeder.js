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
  const collections = await db.collections();
  for (let collection of collections) {
    if (collection.name === 'companies') {
      await collection.drop();
    }
  }

  // create new collection
  const collection = db.collection('companies');
  await collection.create({
    type: CollectionType.DOCUMENT_COLLECTION
  });

  // create a few companies in this collection
  for (let i = 0; i < 3; i++) {
    await collection.save({
      name: faker.company.companyName(),
      since: faker.date.past(15)
    });
  }
}
