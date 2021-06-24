const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { CollectionType } = require('arangojs');
const { server, db } = require('../server');
const { hasCollection } = require('../helpers');

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
    let query = ['FOR x IN companies'];
    const bindVars = {};
    if (!!request.query.search) {
      query.push('FILTER CONTAINS(x.name, @search)');
      bindVars.search = request.query.search;
    }
    if (!!request.query.sort_by) {
      query.push(`SORT x.${request.query.sort_by} ASC`);
    }
    if (!!request.query.limit) {
      query.push('LIMIT 0, @limit');
      bindVars.limit = request.query.limit;
    }
    query.push('RETURN x');
    query = query.join(' ');

    const cursor = await db.query({ query, bindVars });
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
    const company = await db.collection('companies').document(key);
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
    const found = await hasCollection('companies');
    if (!found) {
      await db.createCollection('companies', {
        type: CollectionType.DOCUMENT_COLLECTION
      });
    }
    const now = new Date().toISOString();
    const meta = await db.collection('companies').save({
      name,
      since,
      created_at: now,
      modified_at: now
    }, {
      returnNew: true
    });
    return meta.new;
  }
});

// update a company

server.route({
  method: 'PATCH',
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
    const data = {
      modified_at: new Date().toISOString()
    };
    if (!!name) {
      data.name = name;
    }
    if (!!since) {
      data.since = since;
    }
    const meta = await db.collection('companies').update(key, data, {
      returnNew: true
    });
    return meta.new;
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
        mode: Joi.string().valid('erase', 'trash', 'restore'),
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
    const { mode } = request.payload;
    if (mode === 'erase') {
      await db.collection('companies').remove(key);
      return h.response().code(204);
    } else if (mode === 'trash') {
      const meta = await db.collection('companies').update(key, {
        deleted_at: new Date()
      }, {
        returnNew: true
      });
      return meta.new;
    } else if (mode === 'restore') {
      const meta = await db.collection('companies').update(key, {
        deleted_at: null
      }, {
        keepNull: false, // will not keep "deleted_at" field
        returnNew: true
      });
      return meta.new;
    }
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
