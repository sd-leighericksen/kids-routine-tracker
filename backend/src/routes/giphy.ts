import type { FastifyPluginAsync } from 'fastify';

interface GiphySearchResponse {
  data?: {
    images?: {
      fixed_height?: { url?: string };
      downsized?: { url?: string };
    };
  }[];
}

export const giphyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/giphy/celebration', async (_req, reply) => {
    const apiKey = process.env.GIPHY_API_KEY;
    if (!apiKey) {
      return reply.code(503).send({
        error:
          'GIPHY_API_KEY not configured. Copy backend/.env.example to backend/.env and add a key.',
      });
    }
    const query = process.env.GIPHY_QUERY || 'high five';
    const url =
      `https://api.giphy.com/v1/gifs/search` +
      `?api_key=${encodeURIComponent(apiKey)}` +
      `&q=${encodeURIComponent(query)}` +
      `&rating=g&limit=25`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        return reply
          .code(502)
          .send({ error: `Giphy returned HTTP ${res.status}` });
      }
      const json = (await res.json()) as GiphySearchResponse;
      const urls = (json.data ?? [])
        .map(
          (g) =>
            g?.images?.fixed_height?.url ?? g?.images?.downsized?.url ?? null,
        )
        .filter((u): u is string => typeof u === 'string');
      return { urls };
    } catch (err) {
      return reply
        .code(502)
        .send({ error: `Giphy fetch failed: ${(err as Error).message}` });
    }
  });
};
