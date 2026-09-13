import { KVNamespace } from 'twikoo-cloudflare';

export default {
  async fetch(request, env) {
    const twikoo = new KVNamespace(env.TWIKOO_KV);
    return twikoo.handle(request);
  }
};
