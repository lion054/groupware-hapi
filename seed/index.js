"use strict";

require("dotenv").config();

const CompanySeeder = require("./CompanySeeder");
const UserSeeder = require("./UserSeeder");
const { driver, db } = require("../src/server");

async function run() {
  console.log("company seeder");
  await CompanySeeder();
  console.log("user seeder");
  await UserSeeder();

  db.close();
  driver.close();
}

run();
