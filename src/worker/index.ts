import { handleSetupContact, handleCustomerContact } from './contact-handler';

declare global {
  const ASSETS: any;
}

export interface Env {
  CONTACT_CONFIG: KVNamespace;
  RESEND_API_KEY: string;
  __STATIC_CONTENT?: KVNamespace;
}

const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // API endpoints first
  if (pathname === '/api/setup-contact' && request.method === 'POST') {
    return handleSetupContact(request, env);
  }

  if (pathname === '/api/contact' && request.method === 'POST') {
    return handleCustomerContact(request, env);
  }

  if (pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Root redirect
  if (pathname === '/') {
    return new Response(null, {
      status: 301,
      headers: { Location: '/es/' },
    });
  }

  return new Response('Not found', { status: 404 });
};

export default {
  fetch: handleRequest,
};
