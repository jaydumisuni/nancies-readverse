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

type NormalizedTurn = { role: "user" | "assistant"; content: string };

const personalityGuides: Record<string, string> = {
  Gojo: "playful, highly confident, quick-witted, lightly teasing, protective, energetic and never cruel",
  Itachi: "calm, measured, observant, emotionally restrained, precise, loyal and quietly reassuring; concise in style but substantive in reasoning",
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

const QUALITY_MODELS = [
  "@cf/zai-org/glm-4.7-flash",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
] as const;

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
  const customVibe = typeof body.vibe === "string" ? body.vibe.trim().slice(0, 220) : "";

  if (!question || question.length > 1200) {
    return json({ ok: false, error: "Question must be between 1 and 1200 characters" }, 400);
  }

  const history = normalizeHistory(body.history);
  const quick = quickConversation(question, companion, history);
  if (quick) return json({ ok: true, answer: quick, mode: "conversation-router", companion });

  const recommendation = isRecommendationRequest(question);
  const personality = personalityGuides[companion] ?? personalityGuides.Gojo;
  const prompt = buildSystemPrompt(companion, personality, customVibe, recommendation);
  const models = [...new Set([
    QUALITY_MODELS[0],
    env.AI_MODEL,
    QUALITY_MODELS[1],
    QUALITY_MODELS[2],
  ].filter(Boolean))];

  for (const model of models) {
    const answer = await runCandidate(env, ctx, model, prompt, history, question, recommendation, false);
    if (answer && !isLowQualityAnswer(question, answer, history)) {
      return json({ ok: true, answer, mode: "workers-ai", model, companion });
    }
  }

  const repairPrompt = [
    prompt,
    "QUALITY REPAIR: Earlier candidates were rejected as thin, generic, off-topic or context-losing.",
    "Use the exact subject of the user's question. Name its central concepts explicitly rather than replying with a generic acknowledgement.",
    recommendation
      ? "Give 3 to 5 real relevant titles only when confident, with author and a concrete reason each. Never invent a title."
      : "Give a direct, substantive answer with the key distinction, reasoning and practical implication. Aim for roughly 100 to 220 words unless a shorter answer is genuinely complete.",
    "If this is a follow-up, use the immediately preceding answer and user's earlier question. Do not restart the conversation.",
    "Do not mention the repair process.",
  ].join(" ");

  for (const model of [QUALITY_MODELS[1], QUALITY_MODELS[2], QUALITY_MODELS[0]]) {
    const answer = await runCandidate(env, ctx, model, repairPrompt, history, question, recommendation, true);
    if (answer && !isLowQualityAnswer(question, answer, history)) {
      return json({ ok: true, answer, mode: "workers-ai-repair", model, companion });
    }
  }

  return json({
    ok: true,
    answer: intelligentFallback(question, companion, history),
    mode: "contextual-rules",
    companion,
  });
}

function buildSystemPrompt(
  companion: string,
  personality: string,
  customVibe: string,
  recommendation: boolean,
): string {
  return [
    `You are the ${companion}-inspired reading companion selected in NoTVerse.`,
    `Use only broad personality traits: ${personality}. ${customVibe}`,
    "Maintain a distinct, consistent voice without claiming to be the canonical copyrighted character, quoting catchphrases or reproducing copyrighted dialogue.",
    "Answer the user's actual topic first. Never redirect an ordinary question into uploading a link or file.",
    recommendation
      ? "For recommendations, give 3 to 5 specific relevant titles when reasonably confident, identify author and angle, explain each briefly, then ask at most one useful narrowing question."
      : "For comparisons, explanations and advice, establish the important distinction or trade-off with concrete reasoning. A terse personality must never make the answer shallow.",
    "Use recent history to understand follow-ups such as it, that, yes, another one, why and go ahead. Do not reset the conversation.",
    "Answer with concrete insight rather than generic acknowledgement. Refer explicitly to the central subject or concepts in the user's question.",
    "When the user supplies a source URL, the NoTVerse client verifies it. Never claim a file opened, source resolved, setting saved or Google action completed without confirmed client evidence.",
    "Reading files remain temporary unless the user explicitly saves them. Do not help bypass DRM, paywalls, authentication, CAPTCHAs or access controls.",
    "Never invent a title, author, rating, source result or factual claim. State uncertainty briefly when evidence is insufficient.",
    "If the user challenges, corrects or asks why, respond to that exact turn using the previous answer instead of restarting the topic.",
    "Be concise, useful, spoiler-aware, natural and honest. Avoid canned signature sentences and repeated flourishes.",
  ].join(" ");
}

async function runCandidate(
  env: CompanionEnv,
  ctx: ExecutionContext,
  model: string,
  systemPrompt: string,
  history: NormalizedTurn[],
  question: string,
  recommendation: boolean,
  repair: boolean,
): Promise<string> {
  try {
    const result = await env.AI.run(model as keyof AiModels, {
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: question },
      ],
      max_tokens: recommendation ? (repair ? 680 : 560) : (repair ? 560 : 460),
      temperature: repair ? 0.38 : (recommendation ? 0.56 : 0.58),
    });
    return extractText(result);
  } catch (error) {
    ctx.waitUntil(Promise.resolve(console.warn("NoTVerse companion model fallback", model, error)));
    return "";
  }
}

function normalizeHistory(value: unknown): NormalizedTurn[] {
  if (!Array.isArray(value)) return [];
  const result: NormalizedTurn[] = [];
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

function quickConversation(question: string, companion: string, history: NormalizedTurn[]): string | null {
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
  if (/^(yes|yeah|yep|okay|ok|go ahead|continue|do it)[.!?]*$/.test(value) && history.length) return null;
  return null;
}

function intelligentFallback(question: string, companion: string, history: NormalizedTurn[]): string {
  const value = question.toLowerCase();
  const opener = openings[companion] ?? openings.Gojo;

  if (isRecommendationRequest(question)) return fallbackRecommendations(question, opener);
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
    return `${opener} The AI response did not meet NoTVerse's quality check, so I will not pretend it did. Try that question again in a moment.`;
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
  return `${opener} I do not have enough verified title-level confidence to invent a list for ${cleanTopic}. Give me one constraint—fiction or nonfiction, beginner or specialist, practical or academic—and I will narrow it properly rather than fabricate titles.`;
}

function isRecommendationRequest(value: string): boolean {
  return /\b(recommend(?:ation|ations|ed)?|suggest(?:ion|ions|ed)?|what should i read|books?\s+(?:about|on|for)|reading list|good books?)\b/i.test(value);
}

function recommendationTopic(value: string): string {
  return value
    .replace(/\b(?:do you have|can you give me|give me|any|some|please|recommendations?|recommended|suggestions?|books?|i can read|to read|reading list|good)\b/gi, " ")
    .replace(/^\s*(?:(?:for|on|about)\s+)+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, "")
    .trim()
    .slice(0, 120);
}

function isLowQualityAnswer(question: string, answer: string, history: NormalizedTurn[]): boolean {
  const clean = answer.trim();
  if (!clean) return true;
  const asksForRecommendation = isRecommendationRequest(question);
  const sourceOnly = /paste (?:the |a )?link|attach (?:the |a )?file|inspect public redirects/i.test(clean);
  if (asksForRecommendation && sourceOnly) return true;
  if (asksForRecommendation && clean.length < 180) return true;
  if (!/^(hi|hey|hello|yo|sup|thanks|thank you|ok|okay)[.!?]*$/i.test(question.trim()) && clean.length < 90) return true;
  if (/^(?:i can help|i(?:'m| am) here to help|tell me more|what would you like)[.!?\s]*$/i.test(clean)) return true;
  if (/i (?:do not|don't) have enough reliable substance|rephrase the exact distinction/i.test(clean)) return true;
  const previousAssistant = [...history].reverse().find((turn) => turn.role === "assistant")?.content;
  if (previousAssistant && normaliseForComparison(previousAssistant) === normaliseForComparison(clean)) return true;
  return false;
}

function normaliseForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 500);
}

function extractText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response.trim();
  if (typeof record.text === "string") return record.text.trim();

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0];
  if (first && typeof first === "object") {
    const choice = first as Record<string, unknown>;
    if (typeof choice.text === "string") return choice.text.trim();
    const message = choice.message;
    if (message && typeof message === "object") {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") return content.trim();
    }
  }
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
