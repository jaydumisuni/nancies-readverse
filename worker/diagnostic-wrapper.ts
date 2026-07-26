import app from "./index";

interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
}

const branchOrigin = "https://implement-guided-discovery-library-nancies-readverse.pharrtechnolgiescoltd.workers.dev";
const allowed = new Set(["guided-transform.txt", "guided-types.txt", "guided-architecture.txt"]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/guided-branch-diagnostics/")) {
      const name = url.pathname.slice("/guided-branch-diagnostics/".length);
      if (!allowed.has(name)) return new Response("Not found", { status: 404 });
      const response = await fetch(`${branchOrigin}/${name}`, { headers: { accept: "text/plain" } });
      return new Response(response.body, {
        status: response.status,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
