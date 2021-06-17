'use strict';

require('dotenv').config();

const runCompanySeeder = require('./CompanySeeder');
const runUserSeeder = require('./UserSeeder');

runCompanySeeder();
runUserSeeder();
