import { handleSetupContact, handleCustomerContact } from './contact-handler';

export interface Env {
  CONTACT_CONFIG: KVNamespace;
  RESEND_API_KEY: string;
  __STATIC_CONTENT: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (pathname === '/api/setup-contact' && request.method === 'POST') {
      const response = await handleSetupContact(request, env);
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });
      return newResponse;
    }

    if (pathname === '/api/contact' && request.method === 'POST') {
      const response = await handleCustomerContact(request, env);
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });
      return newResponse;
    }

    if (pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (pathname === '/') {
      return new Response(null, {
        status: 301,
        headers: { Location: '/es/' },
      });
    }

    // Serve static files from KV - search for hashed filenames
    try {
      const list = await env.__STATIC_CONTENT.list({ limit: 1000 });
      
      let target = pathname;
      if (target.startsWith('/')) target = target.slice(1);
      if (target.endsWith('/') || target === '') target += 'index.html';
      
      // Look for files matching this path (handles hashed filenames)
      for (const file of list.keys) {
        const name = file.name;
        if (name === target || name.includes(target.replace(/\.html$/, ''))) {
          const content = await env.__STATIC_CONTENT.get(name);
          if (content) {
            const contentType = name.endsWith('.html')
              ? 'text/html; charset=utf-8'
              : name.endsWith('.js')
              ? 'application/javascript'
              : 'application/octet-stream';
            return new Response(content, {
              headers: { 'Content-Type': contentType },
            });
          }
        }
      }
    } catch (e) {
      console.error('Error serving static file:', e);
    }

    return new Response(JSON.stringify({ error: 'Not found', path: pathname }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
