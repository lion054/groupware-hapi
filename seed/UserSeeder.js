const neo4j = require("neo4j-driver");
const faker = require("faker");
const md5 = require("md5");
const { downloadImage, parseRecord } = require("./helpers");
const { deleteDirectory } = require("../src/helpers");

module.exports = async function () {
  // remove the existing user avatars from local disk
  deleteDirectory("../storage/users");

  // create db connection
  const url = `neo4j://${process.env.DB_HOST}`;
  const { DB_USERNAME: username, DB_PASSWORD: password } = process.env;
  const driver = neo4j.driver(url, neo4j.auth.basic(username, password));
  const session = driver.session();

  try {
    // clean up old nodes and relationships
    await session.run("MATCH (u:User) DETACH DELETE u");

    // create a few users about every company
    const companyRes = await session.run(`
      MATCH (c:Company)
      RETURN c.uuid AS uuid, c.name AS name, c.since AS since, c.createdAt AS createdAt, c.updatedAt AS updatedAt
    `);
    for (let i = 0; i < companyRes.records.length; i++) {
      const company = parseRecord(companyRes.records[i]);
      // create user
      const count = faker.datatype.number({
        min: 3,
        max: 5
      });
      for (let i = 0; i < count; i++) {
        // create user
        let now = new Date();
        now.setMilliseconds(0);
        let nanoseconds = process.hrtime()[1];
        const userRes = await session.run(`
          CREATE (u:User{
            uuid: apoc.create.uuid(),
            name: $name,
            email: $email,
            password: $password,
            createdAt: $createdAt,
            updatedAt: $updatedAt
          })
          RETURN u.uuid AS uuid
        `, {
          name: faker.name.findName(),
          email: faker.internet.email(),
          password: md5("123456"),
          createdAt: neo4j.types.DateTime.fromStandardDate(now, nanoseconds),
          updatedAt: neo4j.types.DateTime.fromStandardDate(now, nanoseconds)
        });
        const user = parseRecord(userRes.records[0]);

        // create avatar
        const fileName = await downloadImage("users", user.uuid);
        now = new Date();
        now.setMilliseconds(0);
        nanoseconds = process.hrtime()[1];
        await session.run(`
          MATCH (u:User{uuid:$uuid})
          SET u.avatar = $avatar, u.updatedAt = $updatedAt
        `, {
          uuid: user.uuid,
          avatar: `users/${user.uuid}/${fileName}`,
          updatedAt: neo4j.types.DateTime.fromStandardDate(now, nanoseconds)
        });

        // register user to company
        await session.run(`
          MATCH (u:User{uuid:$userUuid}), (c:Company{uuid:$companyUuid})
          CREATE (u)-[r:WORK_AT]->(c)
        `, {
          userUuid: user.uuid,
          companyUuid: company.uuid
        });
      }
    }
  } finally {
    await session.close();
  }

  await driver.close();
}
