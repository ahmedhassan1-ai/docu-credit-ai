// deno-lint-ignore-file no-explicit-any
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FileInput {
  name: string;
  mimeType: string;
  data: string; // base64
  kind: "id" | "salary";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { files } = (await req.json()) as { files: FileInput[] };
    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ error: "No files provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idFile = files.find((f) => f.kind === "id");
    const salaryFile = files.find((f) => f.kind === "salary");

    if (!idFile || !salaryFile) {
      return new Response(
        JSON.stringify({ error: "Both an ID document and a Salary Letter are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userContent: any[] = [
      {
        type: "text",
        text: `You are a banking credit officer assistant. Analyze the two attached documents:
1) An ID card/passport (image)
2) A salary letter (PDF or image)

Extract the data and call the function 'submit_analysis' with the structured result.

Rules:
- For the ID, extract the person's full legal name and (if visible) job title.
- For the salary letter, extract: full name, job title, employer, and salary. Determine monthlySalaryUsd and annualSalaryUsd as numbers (USD). If currency differs, convert at a reasonable approximate rate and note it.
- Compare names from ID vs Salary Letter. Names are considered matching if they refer to the same person (ignore casing, accents, middle name order, and minor spelling differences). Set nameMatch=false ONLY when the difference is meaningful.
- conflictReason: short explanation if nameMatch=false, else empty string.
- creditRecommendation: "High Eligibility" if annual >= 50000, "Medium Eligibility" if 20000–49999, "Low Eligibility" if < 20000.
- confidence: 0..1 self-rated extraction confidence.`,
      },
      {
        type: "image_url",
        image_url: { url: `data:${idFile.mimeType};base64,${idFile.data}` },
      },
    ];

    // Salary file: image or pdf
    if (salaryFile.mimeType.startsWith("image/")) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${salaryFile.mimeType};base64,${salaryFile.data}` },
      });
    } else {
      // PDFs / other docs via file part
      userContent.push({
        type: "file",
        file: {
          filename: salaryFile.name || "salary.pdf",
          file_data: `data:${salaryFile.mimeType};base64,${salaryFile.data}`,
        },
      });
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "submit_analysis",
          description: "Submit the structured credit analysis result.",
          parameters: {
            type: "object",
            properties: {
              idName: { type: "string" },
              salaryName: { type: "string" },
              jobTitle: { type: "string" },
              employer: { type: "string" },
              monthlySalaryUsd: { type: "number" },
              annualSalaryUsd: { type: "number" },
              currencyOriginal: { type: "string" },
              nameMatch: { type: "boolean" },
              conflictReason: { type: "string" },
              creditRecommendation: {
                type: "string",
                enum: ["High Eligibility", "Medium Eligibility", "Low Eligibility"],
              },
              confidence: { type: "number" },
              notes: { type: "string" },
            },
            required: [
              "idName",
              "salaryName",
              "jobTitle",
              "monthlySalaryUsd",
              "annualSalaryUsd",
              "nameMatch",
              "creditRecommendation",
            ],
            additionalProperties: false,
          },
        },
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a precise document analysis assistant for a bank's credit department. Always respond by calling the submit_analysis tool exactly once.",
          },
          { role: "user", content: userContent },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "submit_analysis" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "AI analysis failed", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(
        JSON.stringify({ error: "AI did not return structured data", raw: aiJson }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ result: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-documents error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
