const Joi = require("@hapi/joi");
const { parseRecord } = require("../helpers");

const validateUriPath = async (value, options) => {
  const { records } = await db.run(`
    MATCH (c:Company)
    WHERE id(c) = $id
    RETURN COUNT(*)
  `, {
    id: neo4j.int(value.id)
  });
  if (neo4j.integer.toNumber(records[0].get(0)) === 1) {
    return value;
  }
  throw Boom.notFound("This company does not exist");
}

const FindSchema = Joi.object({
  search: Joi.string().trim(),
  sort_by: Joi.string().valid("name", "since"),
  limit: Joi.number().integer().min(5).max(100)
});

const StoreSchema = Joi.object({
  name: Joi.string().trim().required(),
  since: Joi.date().required()
});

const UpdateSchema = Joi.object({
  name: Joi.string().trim(),
  since: Joi.date()
}).required().min(1);

function getCompanyResp(record) {
  const { c } = parseRecord(record);
  return c;
}

function getUserResp(record) {
  const { u } = parseRecord(record, "password"); // exclude sensitive info from all records of result
  return u;
}

const CompanySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  since: Joi.date().required(),
  createdAt: Joi.date().required(),
  updatedAt: Joi.date().required(),
  deletedAt: Joi.date()
});

module.exports = {
  validateUriPath,
  FindSchema,
  StoreSchema,
  UpdateSchema,
  CompanySchema,
  getCompanyResp,
  getUserResp
}
