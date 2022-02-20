const Joi = require("@hapi/joi");
const Boom = require("@hapi/boom");
const neo4j = require("neo4j-driver");
const moment = require("moment");
const { StatusCodes } = require("http-status-codes");
const { server, db } = require("../server");
const { FindSchema, StoreSchema, UpdateSchema, CompanySchema, validateUriPath, getCompanyResp, getUserResp } = require("./model");
const { UserSchema } = require("../user/model");
const { DeleteSchema } = require("../model");

// find some companies

server.route({
  method: "GET",
  path: "/companies",
  options: {
    validate: {
      query: FindSchema,
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
    return records.map(record => getCompanyResp(record));
  }
});

// show a company

server.route({
  method: "GET",
  path: "/companies/{id}",
  options: {
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
    return getCompanyResp(records[0]);
  }
});

// store a company

server.route({
  method: "POST",
  path: "/companies",
  options: {
    validate: {
      payload: StoreSchema,
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
    return h.response(getCompanyResp(records[0])).code(StatusCodes.CREATED);
  }
});

// update a company

server.route({
  method: "PATCH",
  path: "/companies/{id}",
  options: {
    validate: {
      params: validateUriPath,
      payload: UpdateSchema,
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
    return getCompanyResp(records[0]);
  }
});

// delete a company

server.route({
  method: "DELETE",
  path: "/companies/{id}",
  options: {
    validate: {
      params: validateUriPath,
      payload: DeleteSchema,
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
      return getCompanyResp(records[0]);
    } else if (mode === "restore") {
      const { records } = await db.run(`
        MATCH (c:Company)
        WHERE id(c) = $id
        REMOVE c.deletedAt
        RETURN c
      `, {
        id: neo4j.int(request.params.id)
      });
      return getCompanyResp(records[0]);
    }
  }
});

// show the users that is employed by a company

server.route({
  method: "GET",
  path: "/companies/{id}/users",
  options: {
    validate: {
      params: validateUriPath,
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
    return records.map(record => getUserResp(record));
  }
});
