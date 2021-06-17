const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { server, db } = require('../server');

const validateParams = async (value, options) => {
  const users = db.collection('users');
  const found = await users.documentExists(value.key);
  if (found) {
    return value;
  }
  throw Boom.notFound(`This user does not exist`);
}

// list all users

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
    const query = {
      query: ['FOR x IN users'],
      bindVars: {}
    };
    if (!!request.query.search) {
      query.query.push('FILTER x.name LIKE @search || x.email LIKE @search');
      query.bindVars.search = request.query.search;
    }
    if (!!request.query.sort_by) {
      query.query.push(`SORT x.${request.query.sort_by} ASC`);
    }
    if (!!request.query.limit) {
      query.query.push('LIMIT 0, @limit');
      query.bindVars.limit = request.query.limit;
    }
    query.query.push('RETURN x');
    query.query = query.query.join(' ');

    const cursor = await db.query(query);
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
    const user = await users.document(key);
    return user;
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
        since: Joi.date().required()
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
    const { name, since } = request.payload;
    const users = db.collection('users');
    const user = await users.save({
      name,
      since
    }, {
      returnNew: true
    });
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
        since: Joi.date()
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
    const { name, since } = request.payload;
    const data = {};
    if (!!name) {
      data.name = name;
    }
    if (!!since) {
      data.since = since;
    }
    const users = db.collection('users');
    const user = await users.update(key, data, {
      returnNew: true
    });
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
      }).allow(null),
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
      return user.new;
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
    return user.new;
  }
});
