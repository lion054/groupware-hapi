const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const md5 = require('md5');
const { server, db } = require('../server');
const { checkUnique } = require('../helpers');

const validateParams = async (value, options) => {
  const users = db.collection('users');
  const found = await users.documentExists(value.key);
  if (found) {
    return value;
  }
  throw Boom.notFound(`This user does not exist`);
}

// find some users

server.route({
  method: 'GET',
  path: '/users',
  options: {
    validate: {
      query: Joi.object({
        sort_by: Joi.string().valid('name', 'email'),
        limit: Joi.number().integer().min(5).max(100)
      }),
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    }
  },
  handler: async (request, h) => {
    let query = ['FOR x IN users'];
    const bindVars = {};
    if (!!request.query.search) {
      query.push('FILTER CONTAINS(x.name, @search) || CONTAINS(x.email, @search)');
      bindVars.search = request.query.search;
    }
    if (!!request.query.sort_by) {
      query.push(`SORT x.${request.query.sort_by} ASC`);
    }
    if (!!request.query.limit) {
      query.push('LIMIT 0, @limit');
      bindVars.limit = request.query.limit;
    }
    // exclude sensitive info from all records of result
    query.push('RETURN UNSET(x, "password")');
    query = query.join(' ');

    const cursor = await db.query({ query, bindVars });
    const documents = await cursor.all();
    return documents;
  }
});

// show a user

server.route({
  method: 'GET',
  path: '/users/{key}',
  options: {
    validate: {
      params: validateParams,
      failAction: (request, h, err) => {
        throw err;
      }
    }
  },
  handler: async (request, h) => {
    const { key } = request.params;
    const users = db.collection('users');
    // exclude sensitive info from record of result
    const { password, ...rest } = await users.document(key);
    return rest;
  }
});

// store a user

server.route({
  method: 'POST',
  path: '/users',
  options: {
    validate: {
      payload: Joi.object({
        name: Joi.string().trim().required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        password_confirmation: Joi.any().equal(
          Joi.ref('password')
        ).required()
      }),
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    }
  },
  handler: async (request, h) => {
    const { name, email, password } = request.payload; // don't save password_confirmation in record
    const unique = await checkUnique('users', 'email', email);
    if (!unique) {
      throw Boom.conflict('This email address was registered already');
    }
    const users = db.collection('users');
    const user = await users.save({
      name,
      email,
      password: md5(password)
    }, {
      returnNew: true
    });
    delete user.new.password; // exclude sensitive info from record of result
    return user.new;
  }
});

// update a user

server.route({
  method: 'PUT',
  path: '/users/{key}',
  options: {
    validate: {
      params: validateParams,
      payload: Joi.object({
        name: Joi.string().trim(),
        email: Joi.string().email(),
        password_confirmation: Joi.when('password', {
          is: Joi.exist(),
          then: Joi.any().valid(
            Joi.ref('password')
          ).required()
        }),
        password: Joi.string().min(6)
      }),
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    }
  },
  handler: async (request, h) => {
    const { key } = request.params;
    const { name, email, password } = request.payload; // don't save password_confirmation in record
    const data = {};
    if (!!name) {
      data.name = name;
    }
    if (!!email) {
      data.email = email;
    }
    if (!!password) {
      data.password = md5(password);
    }
    const users = db.collection('users');
    const user = await users.update(key, data, {
      returnNew: true
    });
    delete user.new.password; // exclude sensitive info from record of result
    return user.new;
  }
});

// delete a user

server.route({
  method: 'DELETE',
  path: '/users/{key}',
  options: {
    validate: {
      params: validateParams,
      payload: Joi.object({
        forever: Joi.boolean()
      }).allow(null), // will be null if it doesn't contain any field
      options: {
        abortEarly: false
      },
      failAction: (request, h, err) => {
        throw err;
      }
    }
  },
  handler: async (request, h) => {
    const { key } = request.params;
    if (!request.payload) { // will be null if it doesn't contain any field
      request.payload = {};
    }
    const { forever } = request.payload;
    const users = db.collection('users');
    if (forever) {
      await users.remove(key);
      return h.response().code(204);
    } else {
      const user = await users.update(key, {
        deleted_at: new Date()
      }, {
        returnNew: true
      });
      const { password, ...rest } = user.new; // exclude sensitive info from record of result
      return rest;
    }
  }
});

// restore a user

server.route({
  method: 'PATCH',
  path: '/users/{key}',
  options: {
    validate: {
      params: validateParams,
      failAction: (request, h, err) => {
        throw err;
      }
    }
  },
  handler: async (request, h) => {
    const { key } = request.params;
    const users = db.collection('users');
    const user = await users.update(key, {
      deleted_at: null
    }, {
      keepNull: false, // will not keep "deleted_at" field
      returnNew: true
    });
    const { password, ...rest } = user.new; // exclude sensitive info from record of result
    return rest;
  }
});

// show a company that user is employed

server.route({
  method: 'GET',
  path: '/users/{key}/company',
  options: {
    validate: {
      params: validateParams,
      failAction: (request, h, err) => {
        throw err;
      }
    }
  },
  handler: async (request, h) => {
    const { key } = request.params;
    const cursor = await db.query({
      query: `
        FOR vertex, edge, path IN 1..1
        OUTBOUND @startVertex
        GRAPH @graph
        FILTER STARTS_WITH(vertex._id, @prefix)
        RETURN vertex
      `,
      bindVars: {
        startVertex: `users/${key}`,
        graph: 'employment',
        prefix: 'companies/'
      }
    });
    const documents = await cursor.all();
    if (documents.length > 0) {
      return documents[0];
    }
    throw Boom.notFound(`This user is not employed by any company`);
  }
});

// show the collegues that user works together in company

server.route({
  method: 'GET',
  path: '/users/{key}/collegues',
  options: {
    validate: {
      params: validateParams,
      failAction: (request, h, err) => {
        throw err;
      }
    }
  },
  handler: async (request, h) => {
    const { key } = request.params;
    // use "ANY" direction, because startVertex->company is opposite of company->colledge in direction
    // exclude sensitive info from record of result
    const cursor = await db.query({
      query: `
        FOR vertex, edge, path IN 2..2
        ANY @startVertex
        GRAPH @graph
        FILTER STARTS_WITH(vertex._id, @prefix) && vertex._key != @key
        RETURN UNSET(vertex, "password")
      `,
      bindVars: {
        startVertex: `users/${key}`,
        graph: 'employment',
        prefix: 'users/',
        key
      }
    });
    const documents = await cursor.all();
    return documents;
  }
});
