"use strict";

require("dotenv").config();

const CompanySeeder = require("./CompanySeeder");
const UserSeeder = require("./UserSeeder");

async function run() {
  console.log("company seeder");
  await CompanySeeder();
  console.log("user seeder");
  await UserSeeder();
}

run();
