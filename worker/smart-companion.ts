type ChatTurn = { role?: unknown; text?: unknown };
type CompanionBody = {
  question?: unknown;
  companion?: unknown;
  vibe?: unknown;
  history?: unknown;
};

type CompanionEnv = {
  AI: Ai;
  AI_MODEL: string;
};

const personalityGuides: Record<string, string> = {
  Gojo: "playful, highly confident, quick-witted, lightly teasing, protective, energetic and never cruel",
  Itachi: "calm, economical with words, observant, emotionally restrained, precise, loyal and quietly reassuring",
  Naruto: "warm, optimistic, loyal, encouraging, impulsively funny and persistent",
  Kakashi: "relaxed, mature, perceptive, dryly funny, concise and dependable",
  Megumi: "reserved, thoughtful, practical, direct, quietly caring and skeptical of noise",
  Sasuke: "intense, guarded, decisive, terse, attentive and competitive without needless hostility",
  Maki: "strong, blunt, pragmatic, protective, disciplined, dryly funny and allergic to excuses",
  Nobara: "bold, stylish, expressive, sassy, fearless, supportive and sharply opinionated",
  Hinata: "gentle, warm, attentive, softly encouraging, patient and quietly brave",
  Sakura: "caring, practical, confident, lively, no-nonsense and willing to challenge bad ideas",
  Temari: "strategic, composed, efficient, sharp, confident, sarcastically funny and solution-focused",
  "Mei Mei": "elegant, composed, observant, calculating, efficient, subtly mischievous and careful with time",
};

const openings: Record<string, string> = {
  Gojo: "Absolutely.",
  Itachi: "Yes.",
  Naruto: "Definitely.",
  Kakashi: "I have a few good directions.",
  Megumi: "Yes. Let us narrow it properly.",
  Sasuke: "Yes. Start with the useful distinction.",
  Maki: "Yes. No random list, though.",
  Nobara: "Obviously. We are choosing good ones.",
  Hinata: "Yes, I would be happy to help.",
  Sakura: "Yes. Let us make the list actually useful.",
  Temari: "Yes. We can rank the options efficiently.",
  "Mei Mei": "Certainly. A recommendation should justify your time.",
};

export async function handleSmartCompanion(
  request: Request,
  env: CompanionEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: CompanionBody;
  try {
    body = await request.json() as CompanionBody;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const companion = typeof body.companion === "string" && body.companion.trim()
    ? body.companion.trim()
    : "Gojo";
  const customVibe = typeof body.vibe === "string" ? body.vibe.slice(0, 220) : "";
  if (!question || question.length > 1200) {
    return json({ ok: false, error: "Question must be between 1 and 1200 characters" }, 400);
  }

  const history = normalizeHistory(body.history);
  const quick = quickConversation(question, companion, history);
  if (quick) return json({ ok: true, answer: quick, mode: "conversation-router", companion });

  const personality = personalityGuides[companion] ?? personalityGuides.Gojo;
  const recommendation = isRecommendationRequest(question);
  const systemPrompt = [
    `You are the ${companion}-inspired reading companion selected in NoTVerse.`,
    `Use only broad personality traits: ${personality}. ${customVibe}`,
    "Maintain a distinct, consistent voice without claiming to be the canonical copyrighted character, quoting catchphrases or reproducing copyrighted dialogue.",
    "Answer the user's actual topic first. Never redirect an ordinary question or recommendation request into uploading a link or file.",
    "For book recommendations, give 3 to 5 specific relevant titles when reasonably confident, identify author and angle, explain each choice briefly, then ask at most one useful narrowing question.",
    "When the request is broad, provide a balanced starter list rather than refusing or responding with product instructions.",
    "Use recent history to understand follow-ups such as it, that, yes, another one and go ahead. Do not reset the conversation.",
    "When the user supplies a source URL, the NoTVerse client verifies it. Never claim a file opened, source resolved, setting saved or Google action completed without confirmed client evidence.",
    "Reading files remain temporary unless the user explicitly saves them. Do not help bypass DRM, paywalls, authentication, CAPTCHAs or access controls.",
    "Be concise, useful, spoiler-aware, natural and honest. Avoid canned signature sentences and repeated flourishes.",
  ].join(" ");

  const models = [...new Set([
    env.AI_MODEL,
    "@cf/meta/llama-3.1-8b-instruct",
  ].filter(Boolean))];

  for (const model of models) {
    try {
      const result = await env.AI.run(model as keyof AiModels, {
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: question },
        ],
        max_tokens: recommendation ? 520 : 380,
        temperature: recommendation ? 0.62 : 0.75,
      });
      const answer = extractText(result);
      if (answer && !isMismatchedAnswer(question, answer)) {
        return json({ ok: true, answer, mode: "workers-ai", model, companion });
      }
    } catch (error) {
      ctx.waitUntil(Promise.resolve(console.warn("NoTVerse companion model fallback", model, error)));
    }
  }

  return json({
    ok: true,
    answer: intelligentFallback(question, companion, history),
    mode: "contextual-rules",
    companion,
  });
}

function normalizeHistory(value: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(value)) return [];
  const result: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of value.slice(-16) as ChatTurn[]) {
    const role = turn?.role === "user"
      ? "user"
      : turn?.role === "companion" || turn?.role === "assistant"
        ? "assistant"
        : null;
    const text = typeof turn?.text === "string" ? turn.text.trim().slice(0, 900) : "";
    if (role && text) result.push({ role, content: text });
  }
  return result;
}

function quickConversation(
  question: string,
  companion: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string | null {
  const value = question.trim().toLowerCase();
  const opener = openings[companion] ?? openings.Gojo;

  if (/^(hi|hey|hello|yo|sup|good morning|good afternoon|good evening)[.!?]*$/.test(value)) {
    return `${opener} I am here. How are you, and what are we getting into today?`;
  }
  if (/how are you|you good|what(?:'s| is) up/.test(value)) {
    return `${opener} I am good, and I am following the conversation. What is on your mind?`;
  }
  if (/^(thanks|thank you|nice|cool|great|perfect)[.!?]*$/.test(value)) {
    return companion === "Gojo" ? "You are welcome. I will accept the praise responsibly." : "You are welcome. Keep going.";
  }
  if (/^(yes|yeah|yep|okay|ok|go ahead|continue|do it)[.!?]*$/.test(value) && history.length) {
    return null;
  }
  return null;
}

function intelligentFallback(
  question: string,
  companion: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const value = question.toLowerCase();
  const opener = openings[companion] ?? openings.Gojo;

  if (isRecommendationRequest(question)) {
    return fallbackRecommendations(question, opener);
  }
  if (/\b(upload|file|pdf|epub|cbz)\b/.test(value)) {
    return "Attach the file or paste its public link. NoTVerse will verify it before opening it temporarily.";
  }
  if (/\b(link|source|url|ads?|advert(?:isement|ising)?)\b/.test(value)) {
    return "Paste the link directly. NoTVerse will inspect the public destination and supported file candidates, then report exactly what it verified.";
  }
  if (/\b(save|drive|setting|note|progress)\b/.test(value)) {
    return "Tell me which item you want to change or save. I will keep the current context and only claim completion after the app confirms it.";
  }
  if (history.length) {
    const previousUser = [...history].reverse().find((turn) => turn.role === "user")?.content;
    return previousUser
      ? `${opener} I still have your last point about “${previousUser.slice(0, 110)}”. Add the next detail and I will continue from there.`
      : `${opener} Continue naturally; I am keeping the conversation context.`;
  }
  return `${opener} Ask me about a book, a subject, a reading mood or something you only partly remember. I will answer that question first.`;
}

function fallbackRecommendations(question: string, opener: string): string {
  const topic = recommendationTopic(question).toLowerCase();
  if (/\b(?:gambl(?:e|ing|er|ers)?|casino|poker|betting|wager(?:ing)?)\b/.test(topic)) {
    return [
      `${opener} Start with these rather than a random gambling list:`,
      "1. Addiction by Design — Natasha Dow Schüll. A serious look at how machine gambling environments are engineered to keep people playing.",
      "2. The Biggest Bluff — Maria Konnikova. Poker memoir plus psychology, uncertainty and how people learn to make decisions under pressure.",
      "3. Thinking in Bets — Annie Duke. Uses poker to explain probability, incomplete information and better decision-making.",
      "4. The Theory of Gambling and Statistical Logic — Richard A. Epstein. The mathematical and probability side, best when you want something more technical.",
      "Do you want the next list to lean toward addiction and recovery, probability and strategy, or gambling fiction?",
    ].join("\n\n");
  }

  const cleanTopic = recommendationTopic(question) || "that subject";
  return `${opener} For ${cleanTopic}, I would start with a balanced set across an accessible overview, one deeper specialist book, one personal or narrative account and one critical perspective. Tell me whether you prefer fiction, memoir, research or practical guidance, and I will give you specific titles with a reason for each.`;
}

function isRecommendationRequest(value: string): boolean {
  return /\b(recommend(?:ation|ations|ed)?|suggest(?:ion|ions|ed)?|what should i read|books?\s+(?:about|on|for)|reading list|good books?)\b/i.test(value);
}

function recommendationTopic(value: string): string {
  const cleaned = value
    .replace(/\b(?:do you have|can you give me|give me|any|some|please|recommendations?|recommended|suggestions?|books?|i can read|to read|reading list|good)\b/gi, " ")
    .replace(/^\s*(?:(?:for|on|about)\s+)+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, "")
    .trim();
  return cleaned.slice(0, 120);
}

function isMismatchedAnswer(question: string, answer: string): boolean {
  const asksForRecommendation = isRecommendationRequest(question);
  const sourceOnly = /paste (?:the |a )?link|attach (?:the |a )?file|inspect public redirects/i.test(answer);
  return asksForRecommendation && sourceOnly;
}

function extractText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response.trim();
  if (typeof record.text === "string") return record.text.trim();
  return "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
