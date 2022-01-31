const moment = require("moment");
const faker = require("faker");
const { db } = require("../src/server");

module.exports = async function () {
  // clean up old nodes
  await db.run("MATCH (c:Company) DETACH DELETE c");

  // create a few nodes
  for (let i = 0; i < 3; i++) {
    await db.run(`
      CREATE (c:Company {
        name: $name,
        since: date($since),
        createdAt: datetime(),
        updatedAt: datetime()
      })
    `, {
      name: faker.company.companyName(),
      since: moment.utc(faker.date.past(15)).local(true).format("YYYY-MM-DD")
    });
  }
}
