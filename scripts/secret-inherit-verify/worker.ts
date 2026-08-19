export default {
  async fetch(_request: Request, env: { TEST_SECRET?: string; PLAIN?: string }) {
    return Response.json({
      hasSecret: Boolean(env.TEST_SECRET?.length),
      plain: env.PLAIN ?? null,
    });
  },
};
