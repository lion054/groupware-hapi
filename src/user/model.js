const Joi = require("@hapi/joi");
const { parseRecord } = require("../helpers");

const validateUriPath = async (value, options) => {
  const { records } = await db.run(`
    MATCH (u:User)
    WHERE id(u) = $id
    RETURN COUNT(*)
  `, {
    id: neo4j.int(value.id)
  });
  if (neo4j.integer.toNumber(records[0].get(0)) === 1) {
    return value;
  }
  throw Boom.notFound("This user does not exist");
}

const FindSchema = Joi.object({
  search: Joi.string().trim(),
  sort_by: Joi.string().valid("name", "email"),
  limit: Joi.number().integer().min(5).max(100)
});

const StoreSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  password_confirmation: Joi.any().equal(
    Joi.ref("password")
  ).required(),
  avatar: Joi.any().required()
});

const UpdateSchema = Joi.object({
  name: Joi.string().trim(),
  email: Joi.string().email(),
  password_confirmation: Joi.when("password", {
    is: Joi.exist(),
    then: Joi.any().valid(
      Joi.ref("password")
    ).required()
  }),
  password: Joi.string().min(6),
  avatar: Joi.any()
}).required().min(1);

function getUserResp(record) {
  const { u } = parseRecord(record, "password"); // exclude sensitive info from all records of result
  return u;
}

const UserSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  email: Joi.string().required(),
  avatar: Joi.string().required(),
  createdAt: Joi.date().required(),
  updatedAt: Joi.date().required(),
  deletedAt: Joi.date()
});

module.exports = {
  validateUriPath,
  FindSchema,
  StoreSchema,
  UpdateSchema,
  UserSchema,
  getUserResp
}
