const neo4j = require("neo4j-driver");
const faker = require("faker");
const md5 = require("md5");
const { downloadImage } = require("./helpers");
const { deleteDirectory, parseRecord } = require("../src/helpers");
const { db } = require("../src/server");

async function getCompanyIds() {
  const { records } = await db.run("MATCH (c:Company) RETURN c");
  return records.map(record => {
    const { c } = parseRecord(record);
    return c.id;
  });
}

module.exports = async function () {
  // remove the existing user avatars from local disk
  deleteDirectory("../storage/users");

  // clean up old nodes and relationships
  await db.run("MATCH (u:User) DETACH DELETE u");

  // get company list
  const companyIds = await getCompanyIds();

  // create a few users about every company
  for (let i = 0; i < companyIds.length; i++) {
    // create user
    const count = faker.datatype.number({
      min: 3,
      max: 5
    });
    for (let j = 0; j < count; j++) {
      // create user
      const { records } = await db.run(`
        CREATE (u:User {
          name: $name,
          email: $email,
          password: $password,
          createdAt: datetime(),
          updatedAt: datetime()
        })
        RETURN u
      `, {
        name: faker.name.findName(),
        email: faker.internet.email(),
        password: md5("123456")
      });
      const { u } = parseRecord(records[0]);

      // create avatar
      const fileName = await downloadImage("users", u.id);
      const avatar = `users/${u.id}/${fileName}`;
      console.log(avatar);
      await db.run(`
        MATCH (u:User)
        WHERE id(u) = $id
        SET u.avatar = $avatar, u.updatedAt = datetime()
      `, {
        id: neo4j.int(u.id),
        avatar
      });

      // register user to company
      await db.run(`
        MATCH (u:User), (c:Company)
        WHERE id(u) = $userId AND id(c) = $companyId
        CREATE (u)-[r:WORK_AT]->(c)
      `, {
        userId: neo4j.int(u.id),
        companyId: neo4j.int(companyIds[i])
      });
    }
  }
}
