const Hapi = require('@hapi/hapi');
const { Database } = require('arangojs');

const server = Hapi.server({
  host: process.env.HOST,
  port: process.env.PORT,
  routes: {
    cors: {
      origin: [process.env.ORIGIN_ALLOWED] // an array of origins or 'ignore'
    }
  }
});

const db = new Database({
  url: `http://${process.env.DB_HOST}:${process.env.DB_PORT}`,
  databaseName: process.env.DB_DATABASE,
  auth: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD
  }
});

const init = async () => {
  await server.register({
    plugin: require('@hapi/inert')
  });
  await server.start();
  console.log(`Server running at: ${server.info.uri}`);
}

module.exports = {
  server,
  db,
  init
};
