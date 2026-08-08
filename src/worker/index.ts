import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler';
import { handleSetupContact, handleCustomerContact } from './contact-handler';

export interface Env {
  CONTACT_CONFIG: KVNamespace;
  RESEND_API_KEY: string;
  __STATIC_CONTENT?: KVNamespace;
  __STATIC_CONTENT_MANIFEST?: string;
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

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API: Setup contact form
    if (pathname === '/api/setup-contact' && request.method === 'POST') {
      const response = await handleSetupContact(request, env);
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });
      return newResponse;
    }

    // API: Customer inquiry
    if (pathname === '/api/contact' && request.method === 'POST') {
      const response = await handleCustomerContact(request, env);
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });
      return newResponse;
    }

    // Health check
    if (pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Root redirect to Spanish
    if (pathname === '/') {
      return new Response(null, {
        status: 301,
        headers: { Location: '/es/' },
      });
    }

    // Serve static files using getAssetFromKV
    try {
      return await getAssetFromKV(
        { request, waitUntil: ctx.waitUntil },
        {
          mapRequestToAsset,
        }
      );
    } catch (error) {
      // If file not found, return 404
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
