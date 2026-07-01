import { NextRequest, NextResponse } from "next/server";

// Server-side narration endpoint for the Executive Copilot.
// The client sends { facts, instruction }; this route wraps them in the
// narration-only system prompt and calls the Anthropic API with the key from
// the ANTHROPIC_API_KEY environment variable. The key never reaches the client.

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to web/.env.local and restart the dev server." },
      { status: 500 }
    );
  }

  let body: { facts?: string; instruction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { facts, instruction } = body;
  if (!facts || !instruction) {
    return NextResponse.json({ error: "Missing facts or instruction." }, { status: 400 });
  }

  const system = `You are the Executive Copilot inside a credit-policy decision tool for a lending CRO.
You are a NARRATIVE LAYER ONLY. You may use ONLY the numbers that appear in the DATA block below.
NEVER invent, estimate, round differently, or introduce any number not present in DATA.
If a figure is not in DATA, describe it qualitatively instead of inventing it.
Write in a senior-analyst voice: direct, plain, no filler, no emojis, no em-dashes. Speak in dollars, approval rates, and policy, not model metrics.

DATA:
${facts}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: instruction }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json(
        { error: `Anthropic API error (${resp.status}): ${errText.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Could not reach the Anthropic API: ${e?.message ?? "unknown error"}` },
      { status: 502 }
    );
  }
}
