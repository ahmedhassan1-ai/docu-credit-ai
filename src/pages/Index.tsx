import { useMemo, useRef, useState } from "react";
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

const USD_TO_EGP = 48;

type Verdict = "Highly Eligible" | "Review Required" | "Rejected";

type AnalysisResult = {
  idName: string;
  salaryName: string;
  jobTitle: string;
  employer: string;
  annualSalaryUsd: number;
  annualSalaryEgp: number;
  monthlySalaryEgp: number;
  maxInstallmentEgp: number;
  requestedLoanEgp: number;
  loanTermYears: number;
  monthlyInstallmentEgp: number;
  nameMatch: boolean;
  verdict: Verdict;
  justification: string;
};

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
          ? "border-accent bg-accent/10"
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
const formatUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

const namesMatch = (a: string, b: string) => {
  const ta = normalizeName(a);
  const tb = normalizeName(b);
  if (!ta.length || !tb.length) return false;
  // Match if first AND last token align in either direction
  const overlap = ta.filter((t) => tb.includes(t)).length;
  return overlap >= Math.min(2, Math.min(ta.length, tb.length));
};

// Mock applicant pool — simulates what an OCR/AI extraction would yield.
// 20% of the time, the salary letter name is intentionally mismatched to
// demonstrate the security-risk flow.
const MOCK_APPLICANTS: Array<{
  idName: string;
  salaryName: string;
  jobTitle: string;
  employer: string;
  annualSalaryUsd: number;
}> = [
  { idName: "Ahmed Hassan Mahmoud", salaryName: "Ahmed Hassan Mahmoud", jobTitle: "Senior Software Engineer", employer: "Vodafone Egypt", annualSalaryUsd: 42000 },
  { idName: "Mona Ibrahim Saleh", salaryName: "Mona Ibrahim Saleh", jobTitle: "Marketing Manager", employer: "Commercial International Bank", annualSalaryUsd: 36000 },
  { idName: "Omar Khaled Farouk", salaryName: "Omar Khaled Farouk", jobTitle: "Financial Analyst", employer: "EFG Hermes", annualSalaryUsd: 28000 },
  { idName: "Sara Mostafa Ali", salaryName: "Sara Mostafa Ali", jobTitle: "Lead Product Designer", employer: "Instabug", annualSalaryUsd: 54000 },
  { idName: "Youssef Adel Ramadan", salaryName: "Youssef Adel Ramadan", jobTitle: "Operations Director", employer: "Juhayna Food Industries", annualSalaryUsd: 65000 },
  { idName: "Nour Tarek Hosny", salaryName: "Nour Tarek Hosny", jobTitle: "Data Scientist", employer: "Swvl", annualSalaryUsd: 38000 },
  { idName: "Hassan Mahmoud Saeed", salaryName: "Ahmed Mahmoud Saeed", jobTitle: "Sales Account Executive", employer: "Orange Egypt", annualSalaryUsd: 22000 },
  { idName: "Layla Ahmed Fathy", salaryName: "Mariam Ahmed Fathy", jobTitle: "HR Business Partner", employer: "Banque Misr", annualSalaryUsd: 31000 },
];

const pickApplicant = () => MOCK_APPLICANTS[Math.floor(Math.random() * MOCK_APPLICANTS.length)];

const Index = () => {
  const [idFile, setIdFile] = useState<File | null>(null);
  const [salaryFile, setSalaryFile] = useState<File | null>(null);

  const [loanAmount, setLoanAmount] = useState<string>("");
  const [loanTerm, setLoanTerm] = useState<string>("3");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const loanNumber = Number(loanAmount);
  const termYears = Number(loanTerm);

  const canAnalyze = !!idFile && !!salaryFile && loanNumber > 0 && termYears > 0 && !loading;

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    setLoading(true);
    setResult(null);

    // Simulate AI processing latency
    await new Promise((r) => setTimeout(r, 1400));

    // Simulated OCR/AI extraction result for this run
    const applicant = pickApplicant();
    const { idName, salaryName, jobTitle, employer, annualSalaryUsd: salaryNumber } = applicant;

    const annualEgp = salaryNumber * USD_TO_EGP;
    const monthlyEgp = annualEgp / 12;
    const maxInstallment = monthlyEgp * 0.5;
    const months = termYears * 12;
    const monthlyInstallment = loanNumber / months;
    const match = namesMatch(idName, salaryName);

    let verdict: Verdict;
    let justification: string;

    if (!match) {
      verdict = "Rejected";
      justification = `A critical security flag was raised due to a name inconsistency between the ID document ("${idName}") and the salary letter ("${salaryName}"). Per institutional anti-fraud policy, applications with identity discrepancies are automatically rejected and routed for manual investigation. No financial assessment is conducted until identity is conclusively reconciled.`;
    } else if (monthlyInstallment <= maxInstallment) {
      verdict = "Highly Eligible";
      justification = `Applicant ${idName}, employed as ${jobTitle}${employer ? ` at ${employer}` : ""}, demonstrates strong repayment capacity. Verified annual income of ${formatEgp(annualEgp)} translates to a monthly net of ${formatEgp(monthlyEgp)}. The requested loan of ${formatEgp(loanNumber)} over ${termYears} year${termYears > 1 ? "s" : ""} (${months} months) yields a monthly installment of ${formatEgp(monthlyInstallment)} — only ${((monthlyInstallment / monthlyEgp) * 100).toFixed(1)}% of monthly income, well within the 50% Max Allowable Installment threshold of ${formatEgp(maxInstallment)}. Identity is verified across both documents. Recommended for fast-track approval.`;
    } else if (monthlyInstallment <= monthlyEgp * 0.65) {
      verdict = "Review Required";
      justification = `Applicant ${idName} (${jobTitle}${employer ? `, ${employer}` : ""}) has a verified monthly income of ${formatEgp(monthlyEgp)}. The requested loan of ${formatEgp(loanNumber)} over ${termYears} year${termYears > 1 ? "s" : ""} produces a monthly installment of ${formatEgp(monthlyInstallment)} — ${((monthlyInstallment / monthlyEgp) * 100).toFixed(1)}% of monthly net income, marginally exceeding the 50% institutional cap of ${formatEgp(maxInstallment)}. Identity is verified. A senior credit officer should review additional risk factors (existing obligations, tenure, credit history) or consider extending the term before final adjudication.`;
    } else {
      verdict = "Rejected";
      const maxLoanForTerm = maxInstallment * months;
      justification = `Applicant ${idName} (${jobTitle}${employer ? `, ${employer}` : ""}) has a verified monthly income of ${formatEgp(monthlyEgp)}, yielding a Max Allowable Installment of ${formatEgp(maxInstallment)}. The requested loan of ${formatEgp(loanNumber)} over ${termYears} year${termYears > 1 ? "s" : ""} produces a monthly installment of ${formatEgp(monthlyInstallment)} — ${((monthlyInstallment / monthlyEgp) * 100).toFixed(1)}% of monthly net income, substantially above the 50% affordability cap. The application is rejected on debt-service-ratio grounds. Applicant may reapply for up to ${formatEgp(maxLoanForTerm)} over the same ${termYears}-year term, or extend the tenor to reduce the monthly burden.`;
    }

    setResult({
      idName: idName.trim(),
      salaryName: salaryName.trim(),
      jobTitle: jobTitle.trim(),
      employer: employer.trim(),
      annualSalaryUsd: salaryNumber,
      annualSalaryEgp: annualEgp,
      monthlySalaryEgp: monthlyEgp,
      maxInstallmentEgp: maxInstallment,
      requestedLoanEgp: loanNumber,
      loanTermYears: termYears,
      monthlyInstallmentEgp: monthlyInstallment,
      nameMatch: match,
      verdict,
      justification,
    });
    setLoading(false);
    toast.success("Analysis complete");
  };

  const verdictTone = useMemo(() => {
    if (!result) return "";
    if (result.verdict === "Highly Eligible") return "bg-success text-success-foreground";
    if (result.verdict === "Review Required") return "bg-warning text-warning-foreground";
    return "bg-destructive text-destructive-foreground";
  }, [result]);

  return (
    <main className="min-h-screen bg-background dark">
      {/* Top nav */}
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="font-display font-extrabold text-foreground">Credit Officer AI</p>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Banking Verification Suite
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="hidden md:inline-flex gap-1">
            <Sparkles className="h-3 w-3" /> Internal Risk Engine
          </Badge>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero opacity-95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary-glow)/0.5),transparent_60%)]" />
        <div className="relative container py-12 md:py-16 text-primary-foreground">
          <div className="max-w-3xl">
            <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20 backdrop-blur">
              <Sparkles className="h-3 w-3 mr-1" /> AI-Powered Loan Underwriting
            </Badge>
            <h1 className="font-display text-4xl md:text-6xl font-extrabold leading-[1.05] mt-5">
              Credit Officer AI:
              <span className="block bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
                Banking Verification Suite
              </span>
            </h1>
            <p className="mt-5 text-lg text-white/80 max-w-2xl">
              Upload identity & salary documents, enter the requested loan amount, and let the internal risk
              engine deliver a full affordability assessment in seconds.
            </p>
          </div>

          {/* Upload card */}
          <Card className="mt-10 shadow-elegant border-0 animate-fade-in">
            <CardHeader>
              <CardTitle className="font-display text-foreground flex items-center gap-2">
                <Upload className="h-5 w-5 text-accent" /> Loan Application
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <DropZone
                  label="ID Card"
                  hint="Drag & drop or click — JPG, PNG"
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
                    <Wallet className="h-4 w-4 text-accent" /> Requested Loan Amount (EGP)
                  </Label>
                  <Input
                    id="loan"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="Monthly installment in EGP, e.g. 8000"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    className="h-12 text-lg font-semibold"
                  />
                </div>
                <Button
                  size="lg"
                  disabled={!canAnalyze}
                  onClick={handleAnalyze}
                  className="h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-8 shadow-soft"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Running AI Analysis…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Run AI Analysis
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Conversion rate used: 1 USD = {USD_TO_EGP} EGP. Affordability cap: 50% of monthly net income.
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
                body: "Cross-checks the name on the ID against the salary letter to flag inconsistencies.",
              },
              {
                icon: <Wallet className="h-5 w-5" />,
                title: "Salary in EGP",
                body: `Converts the annual salary at ${USD_TO_EGP} EGP/USD and computes monthly net.`,
              },
              {
                icon: <ShieldCheck className="h-5 w-5" />,
                title: "Affordability Check",
                body: "Caps installments at 50% of monthly income for sustainable repayment.",
              },
            ].map((f) => (
              <Card key={f.title} className="bg-card-soft border-border">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent mb-3">
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
              <Alert variant="destructive" className="border-2 border-destructive bg-destructive/15">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle className="font-display text-base font-extrabold uppercase tracking-wide">
                  Security Risk: Name Inconsistency Detected
                </AlertTitle>
                <AlertDescription>
                  ID name <span className="font-semibold">"{result.idName}"</span> does not match Salary Letter
                  name <span className="font-semibold">"{result.salaryName}"</span>. Application has been{" "}
                  <span className="font-bold">automatically rejected</span> pending manual identity review.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-success/40 bg-success/10 text-foreground">
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
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Net (EGP)</p>
                  <p className="font-display font-bold text-lg text-accent mt-1">
                    {formatEgp(result.monthlySalaryEgp)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card-soft">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Max Installment (50%)</p>
                  <p className="font-display font-bold text-lg text-foreground mt-1">
                    {formatEgp(result.maxInstallmentEgp)}
                  </p>
                </CardContent>
              </Card>
              <Card className={verdictTone}>
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wider opacity-80">Final Verdict</p>
                  <div className="flex items-center gap-2 mt-2">
                    {result.verdict === "Highly Eligible" ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : result.verdict === "Review Required" ? (
                      <AlertTriangle className="h-5 w-5" />
                    ) : (
                      <XCircle className="h-5 w-5" />
                    )}
                    <p className="font-display font-extrabold text-xl">{result.verdict}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detail table */}
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="font-display text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5 text-accent" /> Extracted Data
                </CardTitle>
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
                        <Badge className="bg-success text-success-foreground">Extracted</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" /> Company
                        </span>
                      </TableCell>
                      <TableCell>{result.employer || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-success text-success-foreground">Extracted</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Annual Salary (USD)</TableCell>
                      <TableCell>{formatUsd(result.annualSalaryUsd)}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-success text-success-foreground">Extracted</Badge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Financial Breakdown */}
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="font-display text-foreground flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-accent" /> Financial Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-border p-4 bg-card-soft">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Annual Salary</p>
                    <p className="font-display font-bold text-foreground mt-1">
                      {formatUsd(result.annualSalaryUsd)} ×{" "}
                      <span className="text-accent">{USD_TO_EGP}</span> ={" "}
                      <span className="text-accent">{formatEgp(result.annualSalaryEgp)}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-4 bg-card-soft">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Net</p>
                    <p className="font-display font-bold text-foreground mt-1">
                      {formatEgp(result.annualSalaryEgp)} ÷ 12 ={" "}
                      <span className="text-accent">{formatEgp(result.monthlySalaryEgp)}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-4 bg-card-soft">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Max Allowable Installment (50% rule)
                    </p>
                    <p className="font-display font-bold text-foreground mt-1">
                      {formatEgp(result.monthlySalaryEgp)} × 50% ={" "}
                      <span className="text-accent">{formatEgp(result.maxInstallmentEgp)}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-4 bg-card-soft">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Requested Installment</p>
                    <p className="font-display font-bold text-foreground mt-1">
                      <span className="text-accent">{formatEgp(result.requestedLoanEgp)}</span>{" "}
                      <span className="text-sm text-muted-foreground">
                        ({((result.requestedLoanEgp / result.monthlySalaryEgp) * 100).toFixed(1)}% of monthly net)
                      </span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Justification */}
            <Card className="shadow-soft border-l-4 border-l-accent">
              <CardHeader>
                <CardTitle className="font-display text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-accent" /> Detailed Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/90 leading-relaxed">{result.justification}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <footer className="border-t border-border bg-card/40">
        <div className="container py-6 text-center text-xs text-muted-foreground">
          Credit Officer AI — Internal Banking Verification Suite. For demonstration purposes.
        </div>
      </footer>
    </main>
  );
};

export default Index;
