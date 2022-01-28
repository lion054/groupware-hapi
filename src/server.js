const Hapi = require("@hapi/hapi");
const neo4j = require("neo4j-driver");

const server = Hapi.server({
  host: process.env.HOST,
  port: process.env.PORT,
  routes: {
    cors: {
      origin: [process.env.ORIGIN_ALLOWED] // an array of origins or "ignore"
    }
  },
  router: {
    stripTrailingSlash: true
  }
});

// change api endpoint as following:
// http://localhost:5050/api/v1/users
server.realm.modifiers.route.prefix = "/api/v1";

const url = `neo4j://${process.env.DB_HOST}`;
const { DB_USERNAME: username, DB_PASSWORD: password } = process.env;
const driver = neo4j.driver(url, neo4j.auth.basic(username, password));
const db = driver.session();

const init = async () => {
  await server.register({
    plugin: require("@hapi/inert")
  });
  await server.start();
  console.log(`Server running at: ${server.info.uri}`);
}

module.exports = {
  server,
  db,
  init
};
