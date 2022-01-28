const neo4j = require("neo4j-driver");
const faker = require("faker");

module.exports = async function () {
  // create db connection
  const url = `neo4j://${process.env.DB_HOST}`;
  const { DB_USERNAME: username, DB_PASSWORD: password } = process.env;
  const driver = neo4j.driver(url, neo4j.auth.basic(username, password));
  const session = driver.session();

  try {
    // clean up old nodes
    await session.run("MATCH (c:Company) DETACH DELETE c");

    // create a few nodes
    for (let i = 0; i < 3; i++) {
      const now = new Date();
      now.setMilliseconds(0);
      const nanoseconds = process.hrtime()[1];
      await session.run(`
        CREATE (c:Company{
          uuid: apoc.create.uuid(),
          name: $name,
          since: $since,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
      `, {
        name: faker.company.companyName(),
        since: neo4j.types.Date.fromStandardDate(faker.date.past(15)),
        createdAt: neo4j.types.DateTime.fromStandardDate(now, nanoseconds),
        updatedAt: neo4j.types.DateTime.fromStandardDate(now, nanoseconds)
      });
    }
  } finally {
    await session.close();
  }

  await driver.close();
}
