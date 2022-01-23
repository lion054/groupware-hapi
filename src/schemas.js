const Joi = require("@hapi/joi");

module.exports = {
  CompanySchema: Joi.object({
    _key: Joi.string().required(),
    _id: Joi.string().required(),
    _rev: Joi.string().required(),
    name: Joi.string().required(),
    since: Joi.date().required(),
    created_at: Joi.date().required(),
    updated_at: Joi.date().required(),
    deleted_at: Joi.date()
  }),
  UserSchema: Joi.object({
    _key: Joi.string().required(),
    _id: Joi.string().required(),
    _rev: Joi.string().required(),
    name: Joi.string().required(),
    email: Joi.string().required(),
    avatar: Joi.string().required(),
    created_at: Joi.date().required(),
    updated_at: Joi.date().required(),
    deleted_at: Joi.date()
  })
};
