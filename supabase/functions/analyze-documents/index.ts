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

const USD_TO_EGP = 48;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured. Please add it in your project secrets." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { files, requestedLoanEgp } = (await req.json()) as {
      files: FileInput[];
      requestedLoanEgp: number;
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ error: "No files provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const loanAmount = Number(requestedLoanEgp);
    if (!loanAmount || loanAmount <= 0) {
      return new Response(JSON.stringify({ error: "A valid Requested Loan Amount (EGP) is required." }), {
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

    const prompt = `You are a senior banking credit officer in Egypt. Analyze the two attached documents:
1) An ID card/passport (image)
2) A salary letter (PDF or image)

The applicant is requesting a loan of ${loanAmount.toLocaleString()} EGP.

Use these EXACT rules:
- Currency conversion: 1 USD = ${USD_TO_EGP} EGP. If the salary is in USD, convert to EGP using this rate. If already in EGP, keep it.
- monthlySalaryEgp must be a number (in EGP).
- annualSalaryEgp = monthlySalaryEgp * 12.
- maxLoanLimitEgp = 50% of annualSalaryEgp (i.e. annualSalaryEgp * 0.5).
- nameMatch: compare the full name on the ID vs the salary letter. Names match if they refer to the same person (ignore casing, accents, middle name order, minor spelling). Set nameMatch=false ONLY for a meaningful mismatch (e.g. "Hassan" vs "Ahmed").
- conflictReason: short explanation if nameMatch=false, else empty string.
- decision:
   * "Reject" if nameMatch is false (data conflict — never approve a mismatch).
   * "Reject" if requested loan (${loanAmount} EGP) exceeds maxLoanLimitEgp.
   * "Approve" otherwise.
- creditRecommendation:
   * "High Eligibility" if requested <= 50% of maxLoanLimitEgp (very safe).
   * "Medium Eligibility" if requested <= maxLoanLimitEgp.
   * "Low Eligibility" if requested > maxLoanLimitEgp.
- salaryCalculation: 1-2 sentence string showing the conversion math, e.g. "Salary detected as 2,000 USD/month. Converted at 48 EGP/USD → 96,000 EGP/month. Annual = 1,152,000 EGP."
- detailedReport: a thorough 4-6 sentence professional risk assessment in English explaining the final decision. Reference: applicant identity, employer stability, monthly/annual EGP income, the 50% max loan limit, the requested amount vs the limit, and any name conflict. End with a clear Approve/Reject statement and reasoning.
- confidence: 0..1 self-rated extraction confidence.

Respond by calling the submit_analysis function exactly once.`;

    // Build Gemini parts: text + inline ID image + salary (image or pdf)
    const parts: any[] = [
      { text: prompt },
      {
        inline_data: {
          mime_type: idFile.mimeType,
          data: idFile.data,
        },
      },
      {
        inline_data: {
          mime_type: salaryFile.mimeType,
          data: salaryFile.data,
        },
      },
    ];

    const tools = [
      {
        function_declarations: [
          {
            name: "submit_analysis",
            description: "Submit the structured credit analysis result.",
            parameters: {
              type: "object",
              properties: {
                idName: { type: "string" },
                salaryName: { type: "string" },
                jobTitle: { type: "string" },
                employer: { type: "string" },
                currencyOriginal: { type: "string", description: "Original currency on the salary letter (EGP, USD, etc.)" },
                monthlySalaryEgp: { type: "number" },
                annualSalaryEgp: { type: "number" },
                maxLoanLimitEgp: { type: "number" },
                requestedLoanEgp: { type: "number" },
                salaryCalculation: { type: "string" },
                nameMatch: { type: "boolean" },
                conflictReason: { type: "string" },
                creditRecommendation: {
                  type: "string",
                  enum: ["High Eligibility", "Medium Eligibility", "Low Eligibility"],
                },
                decision: { type: "string", enum: ["Approve", "Reject"] },
                detailedReport: { type: "string" },
                confidence: { type: "number" },
              },
              required: [
                "idName",
                "salaryName",
                "jobTitle",
                "monthlySalaryEgp",
                "annualSalaryEgp",
                "maxLoanLimitEgp",
                "salaryCalculation",
                "nameMatch",
                "creditRecommendation",
                "decision",
                "detailedReport",
              ],
            },
          },
        ],
      },
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const aiResp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        tools,
        tool_config: {
          function_calling_config: { mode: "ANY", allowed_function_names: ["submit_analysis"] },
        },
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("Gemini error", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 401 || aiResp.status === 403) {
        return new Response(JSON.stringify({ error: "Invalid GEMINI_API_KEY. Please check the key and try again." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const candidate = aiJson?.candidates?.[0];
    const partsOut = candidate?.content?.parts ?? [];
    const fnCall = partsOut.find((p: any) => p.functionCall)?.functionCall;

    if (!fnCall?.args) {
      console.error("No function call returned", JSON.stringify(aiJson));
      return new Response(
        JSON.stringify({ error: "AI did not return structured data", raw: aiJson }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = fnCall.args as Record<string, any>;

    // Server-side safety: enforce the rules even if model drifts.
    const monthly = Number(parsed.monthlySalaryEgp) || 0;
    const annual = Number(parsed.annualSalaryEgp) || monthly * 12;
    const maxLoan = Number(parsed.maxLoanLimitEgp) || annual * 0.5;
    const nameMatch = !!parsed.nameMatch;

    let decision: "Approve" | "Reject" = parsed.decision === "Approve" ? "Approve" : "Reject";
    if (!nameMatch) decision = "Reject";
    if (loanAmount > maxLoan) decision = "Reject";

    const result = {
      ...parsed,
      monthlySalaryEgp: monthly,
      annualSalaryEgp: annual,
      maxLoanLimitEgp: maxLoan,
      requestedLoanEgp: loanAmount,
      decision,
    };

    return new Response(JSON.stringify({ result }), {
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
