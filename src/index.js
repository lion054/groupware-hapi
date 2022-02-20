"use strict";

require("dotenv").config();
const { server, init } = require("./server");

require("./company/controller");
require("./user/controller");

server.route({
  method: "GET",
  path: "/",
  handler: (request, h) => {
    return "Hello, world!";
  }
});

process.on("unhandledRejection", (e) => {
  console.log(e);
  process.exit(1);
});

init();
