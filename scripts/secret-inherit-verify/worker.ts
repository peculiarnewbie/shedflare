export default {
  async fetch(_request: Request, env: { TEST_SECRET?: string; PLAIN?: string }) {
    return Response.json({
      hasSecret: typeof env.TEST_SECRET === "string" && env.TEST_SECRET.length > 0,
      plain: env.PLAIN ?? null,
    });
  },
};
