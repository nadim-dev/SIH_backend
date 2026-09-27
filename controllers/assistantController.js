import testRules from "../rules/r76-1-2006-test-rules.json" with { type: "json" };

const SYSTEM_PROMPT = `You are NAWI Assistant, an OIML R 76 focused technical guide for testing officers.
Answer technical questions according to the applicable OIML R 76 requirements only, especially OIML R 76-1:2006 where that edition is relevant. Use simple, easy language for a testing officer: explain technical terms the first time, keep sentences short, use numbered steps, and give a small clearly labelled example when it helps. Explain NAWI tests, acceptance criteria, metrological concepts, MPE, test loads, repeatability, eccentricity, tare, weighing performance, and general examination from the standard. Use the NAWI Pro workflow only to explain where an officer records or submits a test; never treat an application's UI behavior as an OIML requirement. Explain steps clearly, use concise headings and numbered instructions when helpful, and ask for missing instrument details when they affect an answer.
When explaining a test, prefer this response structure: a short heading, purpose, numbered procedure, and a compact Markdown table for example readings, observations, or pass/fail checks when a table makes the explanation clearer. Include units in table headings. Use Markdown tables with a header row and separator row. Write equations in plain text, for example: MPE = ±(0.2% × indicated value + 0.05 g). Do not use LaTeX delimiters or commands such as \\[ , \\text{}, \\times, or \\pm. Do not invent readings; label examples clearly as examples. If a relevant project asset or supplied image is available, mention what visual evidence the officer should capture, but do not fabricate an image or URL.

Accuracy and safety:
- Keep the answer anchored to OIML R 76. Distinguish the standard's requirements from laboratory procedure and NAWI Pro workflow. Do not invent clause numbers, tolerances, test loads, or legal interpretations. If the supplied information is insufficient or the edition is uncertain, say so and direct the officer to the applicable controlled copy of OIML R 76 and their laboratory procedure/supervisor.
- The supplied app test catalog is a simplified prototype rule catalog, not the full standard or a legal implementation. Do not present it as authoritative or complete.
- Never claim you have read a specific instrument's saved results unless the user provides them in this conversation.
- For NAWI Pro, the usual officer flow is: register instrument/application → upload required documents → record laboratory environment → review generated test plan → complete assigned examinations/tests (general examination, weighing performance, repeatability, eccentricity, and tare/other assigned tests) → submit results for supervisor review. Exact steps depend on the application status and test plan.
- Do not tell the user to bypass a failed result, alter readings, or mark an incomplete test as passed. Explain evidence and NCR/supervisor escalation when relevant.

Prototype test catalog supplied by NAWI Pro:
${JSON.stringify(testRules.tests.map(({ code, name, description, clause }) => ({ code, name, description, clause })))}

Answer in the user's language when practical. Do not claim to be a legal authority.`;

export const chatWithAssistant = async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ message: "NAWI Assistant is not configured. Set GROQ_API_KEY on the backend." });
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!messages.length || messages.length > 20) {
    return res.status(400).json({ message: "Send between 1 and 20 chat messages." });
  }

  const allowedMessages = messages.every((message) =>
    message && ["user", "assistant"].includes(message.role) && typeof message.content === "string" && message.content.trim().length > 0 && message.content.length <= 4000,
  );
  if (!allowedMessages || messages.at(-1)?.role !== "user") {
    return res.status(400).json({ message: "Chat messages are invalid. The latest message must be a user message of at most 4000 characters." });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_ASSISTANT_MODEL || "openai/gpt-oss-120b",
        temperature: 0.3,
        max_tokens: 1200,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages.map(({ role, content }) => ({ role, content: content.trim() }))],
      }),
      signal: AbortSignal.timeout(45000),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("Groq assistant error:", response.status, result?.error?.message || "request failed");
      return res.status(502).json({ message: "NAWI Assistant could not get a response. Please try again." });
    }

    const answer = result.choices?.[0]?.message?.content?.trim();
    if (!answer) return res.status(502).json({ message: "NAWI Assistant returned an empty response. Please try again." });
    return res.json({ message: answer, model: result.model });
  } catch (error) {
    console.error("NAWI assistant request failed:", error.message);
    return res.status(502).json({ message: "NAWI Assistant is temporarily unavailable. Please try again shortly." });
  }
};
