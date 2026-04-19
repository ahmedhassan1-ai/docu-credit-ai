import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  X,
} from "lucide-react";

type AnalysisResult = {
  idName: string;
  salaryName: string;
  jobTitle: string;
  employer?: string;
  monthlySalaryUsd: number;
  annualSalaryUsd: number;
  currencyOriginal?: string;
  nameMatch: boolean;
  conflictReason?: string;
  creditRecommendation: "High Eligibility" | "Medium Eligibility" | "Low Eligibility";
  confidence?: number;
  notes?: string;
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

const formatUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const Index = () => {
  const [idFile, setIdFile] = useState<File | null>(null);
  const [salaryFile, setSalaryFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const canAnalyze = !!idFile && !!salaryFile && !loading;

  const recoTone = useMemo(() => {
    if (!result) return "";
    if (result.creditRecommendation === "High Eligibility") return "bg-success text-success-foreground";
    if (result.creditRecommendation === "Medium Eligibility") return "bg-warning text-warning-foreground";
    return "bg-destructive text-destructive-foreground";
  }, [result]);

  const handleAnalyze = useCallback(async () => {
    if (!idFile || !salaryFile) return;
    setLoading(true);
    setResult(null);
    try {
      const [idData, salaryData] = await Promise.all([fileToBase64(idFile), fileToBase64(salaryFile)]);
      const { data, error } = await supabase.functions.invoke("analyze-documents", {
        body: {
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
        else if (msg.includes("402")) toast.error("AI credits exhausted. Top up in Settings → Workspace → Usage.");
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
  }, [idFile, salaryFile]);

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
            <Sparkles className="h-3 w-3" /> Powered by Lovable AI
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
              <Sparkles className="h-3 w-3 mr-1" /> AI-Powered Document Verification
            </Badge>
            <h1 className="font-display text-4xl md:text-6xl font-extrabold leading-[1.05] mt-5">
              Verify applicants in <span className="text-white/90">seconds</span>,{" "}
              <span className="block bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
                approve with confidence.
              </span>
            </h1>
            <p className="mt-5 text-lg text-white/80 max-w-2xl">
              Upload an ID card and salary letter. Our AI extracts identity data, cross-checks names, and recommends
              credit eligibility — instantly.
            </p>
          </div>

          {/* Upload card */}
          <Card className="mt-10 shadow-elegant border-0 animate-fade-in">
            <CardHeader>
              <CardTitle className="font-display text-primary flex items-center gap-2">
                <Upload className="h-5 w-5" /> Upload Documents
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

              <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Files are processed securely and used only for this analysis.
                </p>
                <Button
                  size="lg"
                  disabled={!canAnalyze}
                  onClick={handleAnalyze}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 shadow-soft"
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
                title: "Identity Extraction",
                body: "Reads the full name and key details directly from the ID document.",
              },
              {
                icon: <ShieldCheck className="h-5 w-5" />,
                title: "Name Cross-Check",
                body: "Detects mismatches between ID and salary letter to flag potential fraud.",
              },
              {
                icon: <Building2 className="h-5 w-5" />,
                title: "Credit Recommendation",
                body: "Generates an eligibility tier based on monthly and annual salary.",
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
              <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle className="font-display">Data Conflict Detected</AlertTitle>
                <AlertDescription>
                  The name on the ID does not match the name on the salary letter.
                  {result.conflictReason ? <> {result.conflictReason}</> : null} Please request additional verification
                  from the applicant before proceeding.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-success/40 bg-success/5 text-foreground">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <AlertTitle className="font-display text-success">Identity Verified</AlertTitle>
                <AlertDescription>
                  The name on the ID matches the name on the salary letter.
                </AlertDescription>
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
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Job Title</p>
                  <p className="font-display font-bold text-lg text-foreground mt-1 truncate">
                    {result.jobTitle || "—"}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card-soft">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Annual Salary</p>
                  <p className="font-display font-bold text-lg text-primary mt-1">
                    {formatUsd(result.annualSalaryUsd)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-primary text-primary-foreground">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wider text-primary-foreground/70">Recommendation</p>
                  <Badge className={`mt-2 ${recoTone}`}>{result.creditRecommendation}</Badge>
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
                      <TableCell>{formatUsd(result.monthlySalaryUsd)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">Calculated</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Annual Salary</TableCell>
                      <TableCell>{formatUsd(result.annualSalaryUsd)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">Calculated</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Credit Recommendation</TableCell>
                      <TableCell className="font-semibold">{result.creditRecommendation}</TableCell>
                      <TableCell className="text-right">
                        <Badge className={recoTone}>{result.creditRecommendation.split(" ")[0]}</Badge>
                      </TableCell>
                    </TableRow>
                    {typeof result.confidence === "number" && (
                      <TableRow>
                        <TableCell className="font-medium">AI Confidence</TableCell>
                        <TableCell>{Math.round((result.confidence || 0) * 100)}%</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">Self-rated</Badge>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {result.notes && (
                  <p className="mt-4 text-sm text-muted-foreground italic">Notes: {result.notes}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <footer className="border-t border-border py-8 mt-8">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Credit Officer AI · Bank-grade document analysis
        </div>
      </footer>
    </main>
  );
};

export default Index;
