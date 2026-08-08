import { handleSetupContact, handleCustomerContact } from './contact-handler';
import {
  handleSaveContent,
  handleGetContent,
  handleSubmitTour,
  handleGetTours,
  handleDeleteTour,
  handleUploadPhoto,
  handleGetPhotos,
  handleDeletePhoto,
  handleSubmitTestimonial,
  handleGetTestimonials,
  handleDeleteTestimonial,
  handleGetSiteSettings,
  handleSaveSiteSettings,
} from './site-data-handler';

export interface Env {
  CONTACT_CONFIG: KVNamespace;
  RESEND_API_KEY: string;
  OPENROUTER_API_KEY: string;
  __STATIC_CONTENT: KVNamespace;
  SITE_DATA: KVNamespace;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function withCors(response: Response): Response {
  const newResponse = new Response(response.body, response);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });
  return newResponse;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ---- API routes ----
    if (pathname === '/api/setup-contact' && request.method === 'POST') {
      return withCors(await handleSetupContact(request, env));
    }

    if (pathname === '/api/contact' && request.method === 'POST') {
      return withCors(await handleCustomerContact(request, env));
    }

    if (pathname === '/api/save-content' && request.method === 'POST') {
      return withCors(await handleSaveContent(request, env));
    }

    if (pathname === '/api/get-content' && request.method === 'GET') {
      return withCors(await handleGetContent(request, env));
    }

    if (pathname === '/api/submit-tour' && request.method === 'POST') {
      return withCors(await handleSubmitTour(request, env));
    }

    if (pathname === '/api/tours' && request.method === 'GET') {
      return withCors(await handleGetTours(request, env));
    }

    if (pathname === '/api/delete-tour' && request.method === 'POST') {
      return withCors(await handleDeleteTour(request, env));
    }

    if (pathname === '/api/upload-photo' && request.method === 'POST') {
      return withCors(await handleUploadPhoto(request, env));
    }

    if (pathname === '/api/photos' && request.method === 'GET') {
      return withCors(await handleGetPhotos(request, env));
    }

    if (pathname === '/api/delete-photo' && request.method === 'POST') {
      return withCors(await handleDeletePhoto(request, env));
    }

    if (pathname === '/api/testimonials' && request.method === 'POST') {
      return withCors(await handleSubmitTestimonial(request, env));
    }

    if (pathname === '/api/testimonials' && request.method === 'GET') {
      return withCors(await handleGetTestimonials(request, env));
    }

    if (pathname === '/api/delete-testimonial' && request.method === 'POST') {
      return withCors(await handleDeleteTestimonial(request, env));
    }

    if (pathname === '/api/site-settings' && request.method === 'GET') {
      return withCors(await handleGetSiteSettings(request, env));
    }

    if (pathname === '/api/site-settings' && request.method === 'POST') {
      return withCors(await handleSaveSiteSettings(request, env));
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

    // ---- Static files (Astro build output), stored in KV with hashed names ----
    // Wrangler's [site] uploader inserts its own content hash right before the
    // file extension (e.g. client.BRZKPEzt.js -> client.BRZKPEzt.3287e51d2b.js).
    // Strip that hash segment to recover the logical path and match exactly.
    try {
      const list = await env.__STATIC_CONTENT.list({ limit: 1000 });

      let target = pathname;
      if (target.startsWith('/')) target = target.slice(1);
      if (target.endsWith('/') || target === '') target += 'index.html';

      const stripHash = (name: string) => name.replace(/\.[0-9a-f]{8,}(?=\.[^.]+$)/, '');

      for (const file of list.keys) {
        const name = file.name;
        if (stripHash(name) === target) {
          const content = await env.__STATIC_CONTENT.get(name);
          if (content) {
            const contentType = name.endsWith('.html')
              ? 'text/html; charset=utf-8'
              : name.endsWith('.js')
              ? 'application/javascript'
              : name.endsWith('.css')
              ? 'text/css'
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
