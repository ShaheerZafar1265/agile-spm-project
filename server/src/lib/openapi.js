import { buildCatalog, MODULES } from './api-catalog.js';

const MODULE_DESCRIPTIONS = {
  health: 'Service health, diagnostics, and API discovery',
  auth: 'Authentication, session management, and staff account administration',
  customers: 'Customer profiles, contact details, and dietary preferences',
  menu: 'Menu catalog, categories, pricing, recipes, and modifiers',
  orders: 'Dine-in and online order lifecycle, item status, and fulfillment',
  billing: 'Invoicing, payments, split billing, refunds, and receipts',
  tables: 'Floor plan layout, seating capacity, table holding, and waiter assignment',
  reservations: 'Guest booking management, availability checks, and scheduling',
  inventory: 'Stock management, purchase orders, receiving, and low-stock alerts',
  staff: 'Job applications, shift scheduling, and staff performance metrics',
  attendance: 'Clock-in/out attendance tracking, break recording, and timesheets',
  workforce: 'Payroll calculations, hourly wages, bonuses, and deductions',
  analytics: 'Revenue analytics, sales trends, and operational summaries',
  notifications: 'Role-based and user-specific notification feeds',
  settings: 'Restaurant configurations, tax rates, operating hours, and policies',
  reviews: 'Customer ratings, verified dining reviews, and manager response moderation',
};

/**
 * Infer an OpenAPI schema type from catalog type string.
 */
function inferSchema(typeStr) {
  if (!typeStr) return { type: 'string' };
  const lower = String(typeStr).toLowerCase();
  if (lower.includes('int')) return { type: 'integer' };
  if (lower.includes('number') || lower.includes('float')) return { type: 'number' };
  if (lower.includes('bool')) return { type: 'boolean' };
  if (lower.includes('array') || lower.includes('list')) return { type: 'array', items: { type: 'string' } };
  if (lower.includes('date') || lower.includes('yyyy-mm-dd')) return { type: 'string', format: 'date' };
  if (lower.includes('time') || lower.includes('hh:mm')) return { type: 'string', format: 'time' };
  return { type: 'string' };
}

/**
 * Builds an OpenAPI 3.0.3 specification object from the live application router.
 */
export function buildOpenApi(app) {
  const catalog = buildCatalog(app);

  const paths = {};

  for (const entry of catalog) {
    const rawPath = entry.path.replace(/^\/api/, '');
    // Convert Express params :id to OpenAPI params {id}
    const openApiPath = rawPath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

    if (!paths[openApiPath]) paths[openApiPath] = {};

    const method = entry.method.toLowerCase();
    const pathParams = (openApiPath.match(/{([a-zA-Z0-9_]+)}/g) || []).map((p) => p.slice(1, -1));

    const parameters = [];

    // Path parameters
    for (const param of pathParams) {
      parameters.push({
        name: param,
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: `Identifier for ${param}`,
      });
    }

    // Query parameters
    if (entry.query) {
      for (const [qName, qMeta] of Object.entries(entry.query)) {
        parameters.push({
          name: qName,
          in: 'query',
          required: Boolean(qMeta.required),
          schema: inferSchema(qMeta.type),
          description: qMeta.note || `${qName} query parameter`,
        });
      }
    }

    const operation = {
      tags: [entry.module],
      summary: entry.summary || `${entry.method} ${entry.path}`,
      description: entry.access ? `${entry.summary}\n\nAccess: ${entry.access}` : entry.summary,
      parameters,
      responses: {
        [entry.response?.status || 200]: {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: { type: 'object' },
              example: entry.response?.example || {},
            },
          },
        },
      },
    };

    if (entry.auth === 'required') {
      operation.security = [{ bearerAuth: [] }];
      operation.responses['401'] = { description: 'Authentication required' };
      if (entry.roles && entry.roles.length) {
        operation.responses['403'] = { description: `Forbidden for unauthorized roles (${entry.roles.join(', ')})` };
      }
    }

    if (['post', 'put', 'patch'].includes(method) && entry.body) {
      const properties = {};
      const required = [];
      for (const [propName, propMeta] of Object.entries(entry.body)) {
        properties[propName] = {
          ...inferSchema(propMeta.type),
          description: propMeta.note || undefined,
        };
        if (propMeta.required) required.push(propName);
      }
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties,
              ...(required.length ? { required } : {}),
            },
          },
        },
      };
    }

    if (entry.errors && entry.errors.length) {
      for (const err of entry.errors) {
        const code = err.match(/^(\d{3})/)?.[1];
        if (code && !operation.responses[code]) {
          operation.responses[code] = { description: err.replace(/^\d{3}\s*/, '') };
        }
      }
    }

    paths[openApiPath][method] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Restaurant Operations & Ordering Platform API',
      version: '1.0.0',
      description: 'Comprehensive REST API documentation for the Restaurant Operations & Ordering Platform (Agile SPM course project).',
      contact: {
        name: 'Platform Engineering Team',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'Primary API server root',
      },
    ],
    tags: MODULES.map((m) => ({
      name: m,
      description: MODULE_DESCRIPTIONS[m] || `${m} module`,
    })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Provide a valid signed JSON Web Token in the Authorization header: `Bearer <token>`',
        },
      },
    },
  };
}

