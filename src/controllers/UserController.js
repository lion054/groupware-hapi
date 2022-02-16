const Joi = require("@hapi/joi");
const Boom = require("@hapi/boom");
const fs = require("fs");
const path = require("path");
const md5 = require("md5");
const neo4j = require("neo4j-driver");
const { StatusCodes } = require("http-status-codes");
const { server, db } = require("../server");
const { CompanySchema, UserSchema } = require("../schemas");
const { checkUnique, createNestedDirectory, deleteDirectory, acceptFile, parseRecord } = require("../helpers");

const validateParams = async (value, options) => {
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

// find some users

server.route({
  method: "GET",
  path: "/users",
  options: {
    validate: {
      query: Joi.object({
        search: Joi.string().trim(),
        sort_by: Joi.string().valid("name", "email"),
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
      schema: Joi.array().items(UserSchema),
      failAction: async (request, h, err) => {
        throw Boom.badData(err.message);
      }
    }
  },
  handler: async (request, h) => {
    let query = ["MATCH (u:User)"];
    const { search, sort_by, limit } = request.query;
    const bindVars = {};
    if (!!search) {
      query.push("WHERE u.name CONTAINS $search OR u.email CONTAINS $search)");
      bindVars.search = search;
    }
    query.push("RETURN u");
    if (!!sort_by) {
      query.push(`ORDER BY u.${sort_by}`);
    }
    if (!!limit) {
      query.push("SKIP 0 LIMIT $limit");
      bindVars.limit = limit;
    }

    const { records } = await db.run(query.join(" "), bindVars);
    return records.map(record => {
      const { u } = parseRecord(record, "password"); // exclude sensitive info from all records of result
      return u;
    });
  }
});

// show a user

server.route({
  method: "GET",
  path: "/users/{id}",
  options: {
    validate: {
      params: validateParams,
      failAction: (request, h, err) => {
        throw err;
      }
    },
    response: {
      schema: UserSchema,
      failAction: async (request, h, err) => {
        throw Boom.badData(err.message);
      }
    }
  },
  handler: async (request, h) => {
    const { records } = await db.run(`
      MATCH (u:User)
      WHERE id(u) = $id
      RETURN u
    `, {
      id: neo4j.int(request.params.id)
    });
    const { u } = parseRecord(records[0], "password"); // exclude sensitive info from record of result
    return u;
  }
});

// store a user

server.route({
  method: "POST",
  path: "/users",
  options: {
    payload: {
      maxBytes: 5 * 1024 * 1024,
      parse: true,
      multipart: { output: "stream" }
    },
    validate: {
      payload: Joi.object({
        name: Joi.string().trim().required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        password_confirmation: Joi.any().equal(
          Joi.ref("password")
        ).required(),
        avatar: Joi.any().required()
      }),
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    },
    response: {
      schema: UserSchema,
      failAction: async (request, h, err) => {
        throw Boom.badData(err.message);
      }
    }
  },
  handler: async (request, h) => {
    const { name, email, password, avatar } = request.payload; // don't save password_confirmation in record
    const unique = await checkUnique("User", "email", email);
    if (!unique) {
      throw Boom.conflict("This email address was registered already");
    }
    let res = await db.run(`
      CREATE (u:User {
        name: $name,
        email: $email,
        password: $password,
        createdAt: datetime(),
        updatedAt: datetime()
      })
      RETURN u
    `, {
      name,
      email,
      password: md5(password)
    });
    let json = parseRecord(res.records[0], "password"); // exclude sensitive info from record of result
    const dirPath = createNestedDirectory(["..", "storage", "users", json["u"].id]);
    const fileDetails = await acceptFile(avatar, {
      destDir: dirPath,
      fileFilter: (fileName) => {
        return fileName.match(/\.(jpg|jpeg|png|gif)$/);
      }
    });
    res = await db.run(`
      MATCH (u:User)
      WHERE id(u) = $id
      SET u.avatar = $avatar
      RETURN u
    `, {
      id: neo4j.int(json["u"].id),
      avatar: `users/${json["u"].id}/${fileDetails.fileName}`
    });
    json = parseRecord(res.records[0], "password"); // exclude sensitive info from record of result
    return h.response(json["u"]).code(StatusCodes.CREATED);
  }
});

// update a user

server.route({
  method: "PATCH",
  path: "/users/{id}",
  options: {
    payload: {
      maxBytes: 5 * 1024 * 1024,
      parse: true,
      multipart: { output: "stream" }
    },
    validate: {
      params: validateParams,
      payload: Joi.object({
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
      }).required().min(1),
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    },
    response: {
      schema: UserSchema,
      failAction: async (request, h, err) => {
        throw Boom.badData(err.message);
      }
    }
  },
  handler: async (request, h) => {
    const { id } = request.params;
    const { name, email, password, avatar } = request.payload; // don't save password_confirmation in record
    const terms = ["u.updatedAt = datetime()"];
    const bindVars = {};
    if (!!name) {
      terms.push("u.name = $name");
      bindVars.name = name;
    }
    if (!!email) {
      const unique = await checkUnique("User", "email", email, id);
      if (!unique) {
        throw Boom.conflict("This email address was registered already");
      }
      terms.push("u.email = $email");
      bindVars.email = email;
    }
    if (!!password) {
      terms.push("u.password = $password");
      bindVars.password = md5(password);
    }
    if (avatar) {
      const newPath = createNestedDirectory(["..", "storage", "users", id]);
      const fileDetails = await acceptFile(avatar, {
        destDir: newPath,
        fileFilter: (fileName) => {
          return fileName.match(/\.(jpg|jpeg|png|gif)$/);
        }
      });
      terms.push("u.avatar = $avatar");
      bindVars.avatar = `users/${id}/${fileDetails.fileName}`;
      // delete old image file from storage
      const { records } = await db.run(`
        MATCH (u:User)
        WHERE id(u) = $id
        RETURN u
      `, {
        id: neo4j.int(id)
      });
      const { u } = parseRecord(records[0], "password");
      const oldPath = path.join(__dirname, "../../storage/", u.avatar);
      fs.rmSync(oldPath);
    }
    const { records } = await db.run(`
      MATCH (u:User)
      WHERE id(u) = $id
      SET ${terms.join(", ")}
      RETURN u
    `, {
      id: neo4j.int(id),
      ...bindVars
    });
    const { u } = parseRecord(records[0], "password"); // exclude sensitive info from record of result
    return u;
  }
});

// delete a user

server.route({
  method: "DELETE",
  path: "/users/{id}",
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
      schema: UserSchema,
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
    const { id } = request.params;
    const { mode } = request.payload;
    if (mode === "erase") {
      deleteDirectory(`../storage/users/${id}`);
      await db.run(`
        MATCH (u:User)
        WHERE id(u) = $id
        DETACH DELETE u
      `, {
        id: neo4j.int(id)
      });
      return h.response().code(StatusCodes.NO_CONTENT);
    } else if (mode === "trash") {
      const { records } = await db.run(`
        MATCH (u:User)
        WHERE id(u) = $id
        SET u.deletedAt = datetime()
        RETURN u
      `, {
        id: neo4j.int(id)
      });
      const { u } = parseRecord(records[0], "password"); // exclude sensitive info from record of result
      return u;
    } else if (mode === "restore") {
      const { records } = await db.run(`
        MATCH (u:User)
        WHERE id(u) = $id
        REMOVE u.deletedAt
        RETURN u
      `, {
        id: neo4j.int(id)
      });
      const { u } = parseRecord(records[0], "password"); // exclude sensitive info from record of result
      return u;
    }
  }
});

// show a company that user is employed

server.route({
  method: "GET",
  path: "/users/{id}/company",
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
      MATCH (u:User)-[r:WORK_AT]->(c:Company)
      WHERE id(u) = $id
      RETURN c
    `, {
      id: neo4j.int(request.params.id)
    });
    if (records.length === 0) {
      throw Boom.notFound("This user is not employed by any company");
    } else {
      const { c } = parseRecord(records[0]);
      return c;
    }
  }
});

// show the collegues that user works together in company

server.route({
  method: "GET",
  path: "/users/{id}/collegues",
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
      MATCH (u:User)-[:WORK_AT]->(c:Company)<-[:WORK_AT]-(n:User)
      WHERE id(u) = $id
      RETURN n
    `, {
      id: neo4j.int(request.params.id)
    });
    return records.map(record => {
      const { n } = parseRecord(record, "password"); // exclude sensitive info from all records of result
      return n;
    });
  }
});
