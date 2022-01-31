const Joi = require("@hapi/joi");

module.exports = {
  CompanySchema: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    since: Joi.date().required(),
    createdAt: Joi.date().required(),
    updatedAt: Joi.date().required(),
    deletedAt: Joi.date()
  }),
  UserSchema: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    email: Joi.string().required(),
    avatar: Joi.string().required(),
    createdAt: Joi.date().required(),
    updatedAt: Joi.date().required(),
    deletedAt: Joi.date()
  })
};
