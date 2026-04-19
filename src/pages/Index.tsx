import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  IdCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  Upload,
  Wallet,
  X,
  XCircle,
} from "lucide-react";

type AnalysisResult = {
  idName: string;
  salaryName: string;
  jobTitle: string;
  employer?: string;
  currencyOriginal?: string;
  monthlySalaryEgp: number;
  annualSalaryEgp: number;
  maxLoanLimitEgp: number;
  requestedLoanEgp: number;
  salaryCalculation: string;
  nameMatch: boolean;
  conflictReason?: string;
  creditRecommendation: "High Eligibility" | "Medium Eligibility" | "Low Eligibility";
  decision: "Approve" | "Reject";
  detailedReport: string;
  confidence?: number;
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

interface DropZoneProps {
  label: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  file: File | null;
  onFile: (f: File | null) => void;
}

const DropZone = ({ label, hint, accept, icon, file, onFile }: DropZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
        drag
          ? "border-accent bg-accent/5"
          : file
            ? "border-success/60 bg-success/5"
            : "border-border bg-card-soft hover:border-accent/60 hover:bg-accent/5"
      }`}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl mb-3 ${
          file ? "bg-success text-success-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        {file ? <CheckCircle2 className="h-6 w-6" /> : icon}
      </div>
      <p className="font-display font-bold text-foreground">{label}</p>
      <p className="text-sm text-muted-foreground mt-1">{hint}</p>
      {file && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-background px-3 py-2 border border-border">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium truncate max-w-[180px]">{file.name}</span>
          <button
            type="button"
            aria-label="Remove file"
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

const formatEgp = (n: number) =>
  new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n || 0);

const Index = () => {
  const [idFile, setIdFile] = useState<File | null>(null);
  const [salaryFile, setSalaryFile] = useState<File | null>(null);
  const [loanAmount, setLoanAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const loanNumber = Number(loanAmount);
  const canAnalyze = !!idFile && !!salaryFile && loanNumber > 0 && !loading;

  const recoTone = useMemo(() => {
    if (!result) return "";
    if (result.creditRecommendation === "High Eligibility") return "bg-success text-success-foreground";
    if (result.creditRecommendation === "Medium Eligibility") return "bg-warning text-warning-foreground";
    return "bg-destructive text-destructive-foreground";
  }, [result]);

  const decisionApproved = result?.decision === "Approve";

  const handleAnalyze = useCallback(async () => {
    if (!idFile || !salaryFile || loanNumber <= 0) return;
    setLoading(true);
    setResult(null);
    try {
      const [idData, salaryData] = await Promise.all([fileToBase64(idFile), fileToBase64(salaryFile)]);
      const { data, error } = await supabase.functions.invoke("analyze-documents", {
        body: {
          requestedLoanEgp: loanNumber,
          files: [
            { name: idFile.name, mimeType: idFile.type || "image/jpeg", data: idData, kind: "id" },
            {
              name: salaryFile.name,
              mimeType: salaryFile.type || "application/pdf",
              data: salaryData,
              kind: "salary",
            },
          ],
        },
      });

      if (error) {
        const msg = (error as { message?: string }).message || "Analysis failed";
        if (msg.includes("429")) toast.error("Rate limit reached — please wait a moment and try again.");
        else if (msg.toLowerCase().includes("gemini_api_key"))
          toast.error("Gemini API key missing or invalid. Please reconfigure it in settings.");
        else toast.error(msg);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setResult(data.result as AnalysisResult);
      toast.success("Analysis complete");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [idFile, salaryFile, loanNumber]);

  return (
    <main className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="font-display font-extrabold text-primary">Credit Officer AI</p>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Banking Verification Suite</p>
            </div>
          </div>
          <Badge variant="secondary" className="hidden md:inline-flex gap-1">
            <Sparkles className="h-3 w-3" /> Gemini 1.5 Flash
          </Badge>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero opacity-95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary-glow)/0.5),transparent_60%)]" />
        <div className="relative container py-16 md:py-24 text-primary-foreground">
          <div className="max-w-3xl">
            <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20 backdrop-blur">
              <Sparkles className="h-3 w-3 mr-1" /> AI-Powered Loan Underwriting
            </Badge>
            <h1 className="font-display text-4xl md:text-6xl font-extrabold leading-[1.05] mt-5">
              Approve loans in <span className="text-white/90">seconds</span>,{" "}
              <span className="block bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
                with full risk assessment.
              </span>
            </h1>
            <p className="mt-5 text-lg text-white/80 max-w-2xl">
              Upload an ID and a salary letter, enter the requested loan amount, and let the AI verify identity,
              compute affordability, and deliver an approve/reject decision.
            </p>
          </div>

          {/* Upload card */}
          <Card className="mt-10 shadow-elegant border-0 animate-fade-in">
            <CardHeader>
              <CardTitle className="font-display text-primary flex items-center gap-2">
                <Upload className="h-5 w-5" /> Loan Application
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <DropZone
                  label="ID Document"
                  hint="Drag & drop or click — JPG, PNG (image)"
                  accept="image/*"
                  icon={<IdCard className="h-6 w-6" />}
                  file={idFile}
                  onFile={setIdFile}
                />
                <DropZone
                  label="Salary Letter"
                  hint="Drag & drop or click — PDF or image"
                  accept="application/pdf,image/*"
                  icon={<FileText className="h-6 w-6" />}
                  file={salaryFile}
                  onFile={setSalaryFile}
                />
              </div>

              <div className="mt-6 grid md:grid-cols-[1fr_auto] gap-4 items-end">
                <div>
                  <Label htmlFor="loan" className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                    <Wallet className="h-4 w-4 text-primary" /> Requested Loan Amount (EGP)
                  </Label>
                  <Input
                    id="loan"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="e.g. 250000"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    className="h-12 text-lg font-semibold"
                  />
                </div>
                <Button
                  size="lg"
                  disabled={!canAnalyze}
                  onClick={handleAnalyze}
                  className="h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 shadow-soft"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Analyze with AI
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Conversion rate used: 1 USD = 48 EGP. Files are processed securely for this analysis only.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Results */}
      <section className="container py-12 md:py-16">
        {!result && !loading && (
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: <IdCard className="h-5 w-5" />,
                title: "Identity Verification",
                body: "Reads the full name from the ID and cross-checks it against the salary letter.",
              },
              {
                icon: <Wallet className="h-5 w-5" />,
                title: "Salary in EGP",
                body: "Detects salary, converts USD → EGP at 48, and shows the calculation.",
              },
              {
                icon: <ShieldCheck className="h-5 w-5" />,
                title: "Affordability Check",
                body: "Calculates max loan as 50% of annual income and decides Approve / Reject.",
              },
            ].map((f) => (
              <Card key={f.title} className="bg-card-soft border-border">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                    {f.icon}
                  </div>
                  <p className="font-display font-bold text-foreground">{f.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {result && (
          <div className="space-y-6 animate-fade-in">
            {/* Conflict / verified */}
            {!result.nameMatch ? (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle className="font-display text-base">⚠ Data Conflict Detected — Name Mismatch</AlertTitle>
                <AlertDescription>
                  ID name <span className="font-semibold">"{result.idName}"</span> does not match Salary Letter name{" "}
                  <span className="font-semibold">"{result.salaryName}"</span>.
                  {result.conflictReason ? <> {result.conflictReason}</> : null} Application has been{" "}
                  <span className="font-bold">automatically rejected</span> pending manual review.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-success/40 bg-success/5 text-foreground">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <AlertTitle className="font-display text-success">Identity Verified</AlertTitle>
                <AlertDescription>The name on the ID matches the name on the salary letter.</AlertDescription>
              </Alert>
            )}

            {/* Summary cards */}
            <div className="grid md:grid-cols-4 gap-4">
              <Card className="bg-card-soft">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Applicant</p>
                  <p className="font-display font-bold text-lg text-foreground mt-1 truncate">
                    {result.idName || "—"}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card-soft">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Annual Income</p>
                  <p className="font-display font-bold text-lg text-primary mt-1">
                    {formatEgp(result.annualSalaryEgp)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card-soft">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Max Loan Limit (50%)</p>
                  <p className="font-display font-bold text-lg text-foreground mt-1">
                    {formatEgp(result.maxLoanLimitEgp)}
                  </p>
                </CardContent>
              </Card>
              <Card className={decisionApproved ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}>
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wider opacity-80">Decision</p>
                  <div className="flex items-center gap-2 mt-2">
                    {decisionApproved ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                    <p className="font-display font-extrabold text-xl">{result.decision}</p>
                  </div>
                  <Badge variant="secondary" className="mt-2">
                    {result.creditRecommendation}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* Detail table */}
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="font-display text-primary">Extracted Data</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Name on ID</TableCell>
                      <TableCell>{result.idName || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-success text-success-foreground">Extracted</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Name on Salary Letter</TableCell>
                      <TableCell>{result.salaryName || "—"}</TableCell>
                      <TableCell className="text-right">
                        {result.nameMatch ? (
                          <Badge className="bg-success text-success-foreground">Match</Badge>
                        ) : (
                          <Badge className="bg-destructive text-destructive-foreground">Conflict</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Job Title</TableCell>
                      <TableCell>{result.jobTitle || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">Verified</Badge>
                      </TableCell>
                    </TableRow>
                    {result.employer && (
                      <TableRow>
                        <TableCell className="font-medium">Employer</TableCell>
                        <TableCell>{result.employer}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">Verified</Badge>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell className="font-medium">Monthly Salary</TableCell>
                      <TableCell>
                        {formatEgp(result.monthlySalaryEgp)}
                        {result.currencyOriginal && result.currencyOriginal.toUpperCase() !== "EGP" && (
                          <span className="text-xs text-muted-foreground ml-2">
                            (orig. {result.currencyOriginal})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">Calculated</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Annual Salary</TableCell>
                      <TableCell>{formatEgp(result.annualSalaryEgp)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">Calculated</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Max Loan Limit (50% of annual)</TableCell>
                      <TableCell className="font-semibold">{formatEgp(result.maxLoanLimitEgp)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">Rule</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Requested Loan</TableCell>
                      <TableCell className="font-semibold">{formatEgp(result.requestedLoanEgp)}</TableCell>
                      <TableCell className="text-right">
                        {result.requestedLoanEgp <= result.maxLoanLimitEgp ? (
                          <Badge className="bg-success text-success-foreground">Within Limit</Badge>
                        ) : (
                          <Badge className="bg-destructive text-destructive-foreground">Exceeds Limit</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Credit Recommendation</TableCell>
                      <TableCell className="font-semibold">{result.creditRecommendation}</TableCell>
                      <TableCell className="text-right">
                        <Badge className={recoTone}>{result.creditRecommendation.split(" ")[0]}</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Final Decision</TableCell>
                      <TableCell className="font-bold">{result.decision}</TableCell>
                      <TableCell className="text-right">
                        {decisionApproved ? (
                          <Badge className="bg-success text-success-foreground">Approved</Badge>
                        ) : (
                          <Badge className="bg-destructive text-destructive-foreground">Rejected</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Financial Analysis & Risk Assessment */}
            <Card className="shadow-elegant border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="font-display text-primary flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" /> Financial Analysis & Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-lg bg-card-soft p-4 border border-border">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Salary Calculation</p>
                  <p className="text-sm text-foreground leading-relaxed">{result.salaryCalculation}</p>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Annual Income</p>
                    <p className="font-display font-bold text-lg text-foreground mt-1">
                      {formatEgp(result.annualSalaryEgp)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Max Loan (50%)</p>
                    <p className="font-display font-bold text-lg text-foreground mt-1">
                      {formatEgp(result.maxLoanLimitEgp)}
                    </p>
                  </div>
                  <div
                    className={`rounded-lg border p-4 ${
                      result.requestedLoanEgp <= result.maxLoanLimitEgp
                        ? "border-success/40 bg-success/5"
                        : "border-destructive/40 bg-destructive/5"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Requested</p>
                    <p className="font-display font-bold text-lg text-foreground mt-1">
                      {formatEgp(result.requestedLoanEgp)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Officer's Report</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                    {result.detailedReport}
                  </p>
                </div>

                <div
                  className={`rounded-lg p-4 flex items-center gap-3 ${
                    decisionApproved
                      ? "bg-success/10 border border-success/40"
                      : "bg-destructive/10 border border-destructive/40"
                  }`}
                >
                  {decisionApproved ? (
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  ) : (
                    <XCircle className="h-6 w-6 text-destructive" />
                  )}
                  <div>
                    <p className="font-display font-extrabold text-lg">
                      Final Decision: {result.decision}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {decisionApproved
                        ? "Loan is within the affordability limit and identity is verified."
                        : !result.nameMatch
                          ? "Rejected due to name mismatch between ID and salary letter."
                          : "Rejected because the requested amount exceeds the maximum loan limit."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <footer className="border-t border-border py-8 mt-8">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Credit Officer AI · Powered by Google Gemini · 1 USD = 48 EGP
        </div>
      </footer>
    </main>
  );
};

export default Index;
