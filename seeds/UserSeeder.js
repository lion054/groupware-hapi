const { CollectionType, Database } = require('arangojs');
const faker = require('faker');
const md5 = require('md5');
const { deleteDirectory, downloadImage } = require('./helpers');

module.exports = async function () {
  // remove the existing user avatars from local disk
  deleteDirectory('/storage/users');

  // create db connection
  const db = new Database({
    url: `http://${process.env.DB_HOST}:${process.env.DB_PORT}`,
    databaseName: process.env.DB_DATABASE,
    auth: {
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD
    }
  });

  // at the first, clean up old collections and graph
  let usersCollection = db.collection('users');
  let found = await usersCollection.exists();
  if (found) {
    await usersCollection.drop();
  }
  workAtCollection = db.collection('work_at');
  found = await workAtCollection.exists();
  if (found) {
    await workAtCollection.drop();
  }
  let graph = db.graph('employment');
  found = await graph.exists();
  if (found) {
    await graph.drop();
  }

  // create new collections
  usersCollection = db.collection('users');
  await usersCollection.create({
    type: CollectionType.DOCUMENT_COLLECTION
  });
  workAtCollection = db.collection('work_at');
  await workAtCollection.create({
    type: CollectionType.EDGE_COLLECTION
  });

  // create new graph
  graph = db.graph('employment');
  const info = await graph.create([{
    collection: 'work_at',
    from: ['users'],
    to: ['companies']
  }]);

  // create a few users about every company
  const cursor = await db.query(`
    FOR x IN companies
    RETURN x
  `);
  await cursor.forEach(async (company) => {
    const count = faker.datatype.number({
      min: 3,
      max: 5
    });
    for (let i = 0; i < count; i++) {
      // create user
      const meta = await usersCollection.save({
        name: faker.name.findName(),
        email: faker.internet.email(),
        password: md5('123456')
      });
      // create the avatar
      const fileName = await downloadImage('users', meta._key);
      await usersCollection.update(meta._key, {
        avatar: `users/${meta._key}/${fileName}`
      });
      // register user to company
      await workAtCollection.save({
        _from: meta._id,
        _to: company._id,
        since: faker.date.past(15),
        position: faker.name.jobTitle()
      });
    }
  });
}
