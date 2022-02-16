const Joi = require("@hapi/joi");
const Boom = require("@hapi/boom");
const neo4j = require("neo4j-driver");
const moment = require("moment");
const { StatusCodes } = require("http-status-codes");
const { server, db } = require("../server");
const { CompanySchema, UserSchema } = require("../schemas");
const { parseRecord } = require("../helpers");

const validateParams = async (value, options) => {
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

// find some companies

server.route({
  method: "GET",
  path: "/companies",
  options: {
    validate: {
      query: Joi.object({
        search: Joi.string().trim(),
        sort_by: Joi.string().valid("name", "since"),
        limit: Joi.number().integer().min(5).max(100)
      }),
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    },
    response: {
      schema: Joi.array().items(CompanySchema),
      failAction: async (request, h, err) => {
        throw Boom.badData(err.message);
      }
    }
  },
  handler: async (request, h) => {
    let query = ["MATCH (c:Company)"];
    const { search, sort_by, limit } = request.query;
    const bindVars = {};
    if (!!search) {
      query.push("WHERE c.name CONTAINS $search");
      bindVars.search = search;
    }
    query.push("RETURN c");
    if (!!sort_by) {
      query.push(`ORDER BY c.${sort_by}`);
    }
    if (!!limit) {
      query.push("SKIP 0 LIMIT $limit");
      bindVars.limit = limit;
    }

    const { records } = await db.run(query.join(" "), bindVars);
    return records.map(record => {
      const { c } = parseRecord(record);
      return c;
    });
  }
});

// show a company

server.route({
  method: "GET",
  path: "/companies/{id}",
  options: {
    validate: {
      params: validateParams,
      failAction: (request, h, err) => {
        throw err;
      }
    },
    response: {
      schema: CompanySchema,
      failAction: async (request, h, err) => {
        throw Boom.badData(err.message);
      }
    }
  },
  handler: async (request, h) => {
    const { records } = await db.run(`
      MATCH (c:Company)
      WHERE id(c) = $id
      RETURN c
    `, {
      id: neo4j.int(request.params.id)
    });
    const { c } = parseRecord(records[0]);
    return c;
  }
});

// store a company

server.route({
  method: "POST",
  path: "/companies",
  options: {
    validate: {
      payload: Joi.object({
        name: Joi.string().trim().required(),
        since: Joi.date().required()
      }),
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    },
    response: {
      schema: CompanySchema,
      failAction: async (request, h, err) => {
        throw Boom.badData(err.message);
      }
    }
  },
  handler: async (request, h) => {
    const { name, since } = request.payload;
    const { records } = await db.run(`
      CREATE (c:Company {
        name: $name,
        since: date($since),
        createdAt: datetime(),
        updatedAt: datetime()
      })
      RETURN c
    `, {
      name,
      since: moment.utc(since).local(true).format("YYYY-MM-DD") // input may be in various format
    });
    const { c } = parseRecord(records[0]);
    return h.response(c).code(StatusCodes.CREATED);
  }
});

// update a company

server.route({
  method: "PATCH",
  path: "/companies/{id}",
  options: {
    validate: {
      params: validateParams,
      payload: Joi.object({
        name: Joi.string().trim(),
        since: Joi.date()
      }).required().min(1),
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    },
    response: {
      schema: CompanySchema,
      failAction: async (request, h, err) => {
        throw Boom.badData(err.message);
      }
    }
  },
  handler: async (request, h) => {
    const { name, since } = request.payload;
    const terms = ["c.updatedAt = datetime()"];
    const bindVars = {};
    if (!!name) {
      terms.push("c.name = $name");
      bindVars.name = name;
    }
    if (!!since) {
      terms.push("c.since = date($since)");
      bindVars.since = moment.utc(since).local(true).format("YYYY-MM-DD");
    }
    const { records } = await db.run(`
      MATCH (c:Company)
      WHERE id(c) = $id
      SET ${terms.join(", ")}
      RETURN c
    `, {
      id: neo4j.int(request.params.id),
      ...bindVars
    });
    const { c } = parseRecord(records[0]);
    return c;
  }
});

// delete a company

server.route({
  method: "DELETE",
  path: "/companies/{id}",
  options: {
    validate: {
      params: validateParams,
      payload: Joi.object({
        mode: Joi.string().valid("erase", "trash", "restore")
      }),
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    },
    response: {
      schema: CompanySchema,
      failAction: async (request, h, err) => {
        if (request.response.statusCode === 204) {
          return h.response().code(204);
        } else {
          throw Boom.badData(err.message);
        }
      }
    }
  },
  handler: async (request, h) => {
    const { mode } = request.payload;
    if (mode === "erase") {
      await db.run(`
        MATCH (c:Company)
        WHERE id(c) = $id
        DETACH DELETE c
      `, {
        id: neo4j.int(request.params.id)
      });
      return h.response().code(StatusCodes.NO_CONTENT);
    } else if (mode === "trash") {
      const { records } = await db.run(`
        MATCH (c:Company)
        WHERE id(c) = $id
        SET c.deletedAt = datetime()
        RETURN c
      `, {
        id: neo4j.int(request.params.id)
      });
      const { c } = parseRecord(records[0]);
      return c;
    } else if (mode === "restore") {
      const { records } = await db.run(`
        MATCH (c:Company)
        WHERE id(c) = $id
        REMOVE c.deletedAt
        RETURN c
      `, {
        id: neo4j.int(request.params.id)
      });
      const { c } = parseRecord(records[0]);
      return c;
    }
  }
});

// show the users that is employed by a company

server.route({
  method: "GET",
  path: "/companies/{id}/users",
  options: {
    validate: {
      params: validateParams,
      failAction: (request, h, err) => {
        throw err;
      }
    },
    response: {
      schema: Joi.array().items(UserSchema),
      failAction: async (request, h, err) => {
        throw Boom.badData(err.message);
      }
    }
  },
  handler: async (request, h) => {
    const { records } = await db.run(`
      MATCH (u:User)-[r:WORK_AT]->(c:Company)
      WHERE id(c) = $id
      RETURN u
    `, {
      id: neo4j.int(request.params.id)
    });
    return records.map(record => {
      const { u } = parseRecord(record, "password"); // exclude sensitive info from all records of result
      return u;
    });
  }
});
