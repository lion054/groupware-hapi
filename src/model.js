const Joi = require("@hapi/joi");

const DeleteSchema = Joi.object({
  mode: Joi.string().valid("erase", "trash", "restore")
});

module.exports = {
  DeleteSchema
}
