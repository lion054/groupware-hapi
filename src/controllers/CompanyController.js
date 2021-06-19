const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { server, db } = require('../server');

const validateParams = async (value, options) => {
  const companies = db.collection('companies');
  const found = await companies.documentExists(value.key);
  if (found) {
    return value;
  }
  throw Boom.notFound(`This company does not exist`);
}

// find some companies

server.route({
  method: 'GET',
  path: '/companies',
  options: {
    validate: {
      query: Joi.object({
        sort_by: Joi.string().valid('name', 'since'),
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
      query: ['FOR x IN companies'],
      bindVars: {}
    };
    if (!!request.query.search) {
      query.query.push('FILTER CONTAINS(x.name, @search)');
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

// show a company

server.route({
  method: 'GET',
  path: '/companies/{key}',
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
    const companies = db.collection('companies');
    const company = await companies.document(key);
    return company;
  }
});

// store a company

server.route({
  method: 'POST',
  path: '/companies',
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
    const companies = db.collection('companies');
    const company = await companies.save({
      name,
      since
    }, {
      returnNew: true
    });
    return company.new;
  }
});

// update a company

server.route({
  method: 'PUT',
  path: '/companies/{key}',
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
    const companies = db.collection('companies');
    const company = await companies.update(key, data, {
      returnNew: true
    });
    return company.new;
  }
});

// delete a company

server.route({
  method: 'DELETE',
  path: '/companies/{key}',
  options: {
    validate: {
      params: validateParams,
      payload: Joi.object({
        forever: Joi.boolean()
      }).allow(null), // must allow null if it doesn't contain any field
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
    const companies = db.collection('companies');
    if (forever) {
      await companies.remove(key);
      return h.response().code(204);
    } else {
      const company = await companies.update(key, {
        deleted_at: new Date()
      }, {
        returnNew: true
      });
      return company.new;
    }
  }
});

// restore a company

server.route({
  method: 'PATCH',
  path: '/companies/{key}',
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
    const companies = db.collection('companies');
    const company = await companies.update(key, {
      deleted_at: null
    }, {
      keepNull: false, // will not keep "deleted_at" field
      returnNew: true
    });
    return company.new;
  }
});

// show the users that is employed by a company

server.route({
  method: 'GET',
  path: '/companies/{key}/users',
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
    // exclude sensitive info from all records of result
    const cursor = await db.query({
      query: `
        FOR vertex, edge, path IN 1..1
        INBOUND @startVertex
        GRAPH "employment"
        FILTER STARTS_WITH(vertex._id, "users/")
        RETURN UNSET(vertex, "password")
      `,
      bindVars: {
        startVertex: `companies/${key}`
      }
    });
    const documents = await cursor.all();
    return documents;
  }
});
