export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();
    const { action, path, nick, mail, content, link } = body;
    const kvKey = 'comments_' + path;

    if (action === 'getComments') {
      const data = await env.TWIKOO_KV.get(kvKey) || '[]';
      return new Response(data, {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (action === 'addComment') {
      const comments = JSON.parse(await env.TWIKOO_KV.get(kvKey) || '[]');
      const comment = {
        _id: Date.now().toString(),
        nick: nick || '匿名',
        mail: mail || '',
        content: content || '',
        link: link || '',
        created: Date.now(),
        ua: request.headers.get('user-agent') || '',
        ip: request.headers.get('cf-connecting-ip') || ''
      };
      comments.push(comment);
      await env.TWIKOO_KV.put(kvKey, JSON.stringify(comments));
      return new Response(JSON.stringify(comment), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (action === 'getCounts') {
      const comments = JSON.parse(await env.TWIKOO_KV.get(kvKey) || '[]');
      return new Response(JSON.stringify([{ path, count: comments.length }]), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

export async function onRequestGet({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '/';
  const action = url.searchParams.get('action') || '';

  if (action === 'getComments') {
    const data = await env.TWIKOO_KV.get('comments_' + path) || '[]';
    return new Response(data, {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (action === 'getCounts') {
    const comments = JSON.parse(await env.TWIKOO_KV.get('comments_' + path) || '[]');
    return new Response(JSON.stringify([{ path, count: comments.length }]), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  return new Response('Comment API OK', {
    headers: { 'Content-Type': 'text/plain', ...corsHeaders }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
