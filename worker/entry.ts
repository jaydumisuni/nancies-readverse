import baseWorker from "./index";
import { handleCanonicalTopicTurn } from "./grounded-canonical";
import { handleGroundedReaderTurn } from "./grounded-reader";
import { handleSmartCompanion } from "./smart-companion";

interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
  SESSION_KV?: KVNamespace;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  TOKEN_ENCRYPTION_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/companion/help") {
      try {
        const canonical = await handleCanonicalTopicTurn(request.clone(), env, ctx);
        if (canonical) return canonical;
      } catch (error) {
        ctx.waitUntil(Promise.resolve(console.warn("NoTVerse canonical grounding fallback", error)));
      }

      try {
        const grounded = await handleGroundedReaderTurn(request.clone(), env, ctx);
        if (grounded) return grounded;
      } catch (error) {
        ctx.waitUntil(Promise.resolve(console.warn("NoTVerse reader grounding fallback", error)));
      }

      return handleSmartCompanion(request, env, ctx);
    }
    return baseWorker.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
