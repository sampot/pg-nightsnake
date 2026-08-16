export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-nightsnake",
      path: new URL(request.url).pathname,
    });
  },
};
