import { handleSetupContact, handleCustomerContact } from './contact-handler';
import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler';

export interface Env {
  CONTACT_CONFIG: KVNamespace;
  RESEND_API_KEY: string;
  __STATIC_CONTENT?: any;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API endpoints first
    if (url.pathname === '/api/setup-contact' && request.method === 'POST') {
      const response = await handleSetupContact(request, env);
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });
      return newResponse;
    }

    if (url.pathname === '/api/contact' && request.method === 'POST') {
      const response = await handleCustomerContact(request, env);
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });
      return newResponse;
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Root redirect
    if (url.pathname === '/') {
      return new Response(null, {
        status: 301,
        headers: {
          Location: '/es/',
          ...corsHeaders,
        },
      });
    }

    // Serve static files from Astro build output
    try {
      const asset = await getAssetFromKV(
        { request, waitUntil: ctx.waitUntil },
        {
          mapRequestToAsset,
        }
      );
      return asset;
    } catch (error) {
      // If asset not found, check if it's a directory that needs index.html
      if (url.pathname.endsWith('/')) {
        try {
          const indexPath = url.pathname + 'index.html';
          const indexRequest = new Request(new URL(indexPath, url).toString(), request);
          const indexAsset = await getAssetFromKV(
            { request: indexRequest, waitUntil: ctx.waitUntil },
            {
              mapRequestToAsset,
            }
          );
          return indexAsset;
        } catch {
          // Continue to 404
        }
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
