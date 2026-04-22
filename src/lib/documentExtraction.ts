import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const OCR_CORE_PATH = "/tesseract-core";
const OCR_WORKER_PATH = "/tesseract/worker.min.js";
const OCR_LANG_PATH = "/tesseract-lang";

const SALARY_KEYWORDS = /salary|income|compensation|earnings|pay|remuneration/i;
const MONTHLY_KEYWORDS = /month|monthly|per month/i;
const ANNUAL_KEYWORDS = /annual|annually|yearly|per annum|year/i;
const NOISE_KEYWORDS = /national|identification|id number|issue date|expiry|iban|account|phone|mobile|fax|reference|ref\.?|invoice|tax/i;

type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

export type ExtractedApplicantData = {
  idName: string;
  salaryName: string;
  jobTitle: string;
  employer: string;
  annualSalaryUsd: number;
  rawIdText: string;
  rawSalaryText: string;
};

let workerPromise: Promise<OcrWorker> | null = null;

const normalizeWhitespace = (value: string) =>
  value
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

const cleanExtractedValue = (value: string) => value.replace(/[\s,;:.\-]+$/g, "").trim();

const splitIntoLines = (value: string) =>
  Array.from(
    new Set(
      normalizeWhitespace(value)
        .split(/\n+| {3,}/)
        .map((line) => cleanExtractedValue(line))
        .filter(Boolean),
    ),
  );

const prettifyPersonName = (value: string) =>
  cleanExtractedValue(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

const parseNumericValue = (value: string) => Number(value.replace(/,/g, "").trim());

const canvasToBlob = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not convert PDF page to image");
  return blob;
};

const getOcrWorker = async () => {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      corePath: OCR_CORE_PATH,
      workerPath: OCR_WORKER_PATH,
      langPath: OCR_LANG_PATH,
      gzip: true,
      workerBlobURL: false,
      logger: () => undefined,
      errorHandler: () => undefined,
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: "11",
        preserve_interword_spaces: "1",
      });
      return worker;
    });
  }

  return workerPromise;
};

const recognizeWithOcr = async (image: File | Blob) => {
  const worker = await getOcrWorker();
  const result = await worker.recognize(image);
  return normalizeWhitespace(result.data.text || "");
};

const extractTextFromPdf = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data: bytes }).promise;
  const maxPages = Math.min(pdf.numPages, 3);

  let nativeText = "";
  let ocrText = "";

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as Array<{ str?: string }>)
      .map((item) => item.str ?? "")
      .join(" ")
      .trim();

    if (pageText) nativeText += `\n${pageText}`;

    if (pageText.replace(/\s/g, "").length < 40) {
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) continue;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvasToBlob(canvas);
      ocrText += `\n${await recognizeWithOcr(blob)}`;
    }
  }

  return normalizeWhitespace([nativeText, ocrText].filter(Boolean).join("\n"));
};

const extractTextFromFile = async (file: File) => {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractTextFromPdf(file);
  }

  return recognizeWithOcr(file);
};

const extractByPatterns = (text: string, patterns: RegExp[], formatter?: (value: string) => string) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = cleanExtractedValue(match[1]);
      return formatter ? formatter(value) : value;
    }
  }

  return "";
};

const findFallbackName = (text: string) => {
  const candidates = Array.from(
    new Set(text.match(/\b(?:[A-Z][A-Za-z'-]+|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z'-]+|[A-Z]{2,})){1,4}\b/g) ?? []),
  );

  const bestCandidate = candidates.find(
    (candidate) =>
      !/salary|certificate|employment|department|letter|bank|company|address|manager|human resources/i.test(candidate),
  );

  return bestCandidate ? prettifyPersonName(bestCandidate) : "";
};

const extractName = (text: string, documentType: "id" | "salary") => {
  const commonPatterns = [
    /(?:employee|staff|full)?\s*name\s*[:\-]\s*([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){1,4})/i,
    /this is to certify that\s+(?:mr\.?|mrs\.?|ms\.?)?\s*([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){1,4})/i,
    /certify that\s+(?:mr\.?|mrs\.?|ms\.?)?\s*([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){1,4})/i,
    /holder name\s*[:\-]\s*([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){1,4})/i,
    /name\s+of\s+(?:employee|applicant|holder)\s*[:\-]\s*([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){1,4})/i,
  ];

  const idPatterns = [
    /full name\s*[:\-]\s*([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){1,4})/i,
    /surname\s*[:\-]\s*([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){1,4})/i,
  ];

  const patterns = documentType === "id" ? [...idPatterns, ...commonPatterns] : commonPatterns;
  return extractByPatterns(text, patterns, prettifyPersonName) || findFallbackName(text);
};

const extractJobTitle = (text: string) =>
  extractByPatterns(text, [
    /(?:job title|position|designation|occupation|title)\s*[:\-]\s*([A-Za-z][A-Za-z &,/\-]{2,60})/i,
    /employed as\s+(?:an?\s+)?([A-Za-z][A-Za-z &,/\-]{2,60})/i,
    /working as\s+(?:an?\s+)?([A-Za-z][A-Za-z &,/\-]{2,60})/i,
  ]);

const extractEmployer = (text: string) => {
  const fromPattern = extractByPatterns(text, [
    /(?:employer|company|organization|organisation)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9 '&.,\-/]{2,80})/i,
    /employed by\s+([A-Za-z0-9][A-Za-z0-9 '&.,\-/]{2,80})/i,
    /works? at\s+([A-Za-z0-9][A-Za-z0-9 '&.,\-/]{2,80})/i,
  ]);

  if (fromPattern) return fromPattern;

  const lineCandidate = splitIntoLines(text).find((line) => /(bank|company|group|limited|ltd|llc|inc|corporation|egypt)/i.test(line));
  return lineCandidate ?? "";
};

const extractAnnualSalaryUsd = (text: string) => {
  const directPatterns = [
    { pattern: /(?:annual|yearly|gross annual|annual gross|annual)\s+(?:salary|income|compensation)?\s*[:\-]?\s*(?:usd|us\$|\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,7}(?:\.\d+)?)/i, monthly: false },
    { pattern: /(?:salary|income|compensation|earnings)\s*[:\-]?\s*(?:usd|us\$|\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,7}(?:\.\d+)?)/i, monthly: false },
    { pattern: /(?:monthly|net monthly|gross monthly)\s+(?:salary|income|compensation)?\s*[:\-]?\s*(?:usd|us\$|\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{3,6}(?:\.\d+)?)/i, monthly: true },
  ];

  for (const { pattern, monthly } of directPatterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;

    const value = parseNumericValue(match[1]);
    if (!Number.isFinite(value) || value <= 0) continue;
    return monthly ? value * 12 : value;
  }

  const candidates = Array.from(text.matchAll(/(?:usd|us\$|\$|egp)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,7}(?:\.\d+)?)/gi))
    .map((match) => {
      const rawValue = match[1];
      const value = parseNumericValue(rawValue);
      const index = match.index ?? 0;
      const context = text.slice(Math.max(0, index - 60), Math.min(text.length, index + rawValue.length + 60));

      let score = 0;
      if (SALARY_KEYWORDS.test(context)) score += 8;
      if (ANNUAL_KEYWORDS.test(context)) score += 6;
      if (MONTHLY_KEYWORDS.test(context)) score += 4;
      if (/usd|us\$|\$/i.test(context)) score += 3;
      if (NOISE_KEYWORDS.test(context)) score -= 8;
      if (value >= 10000 && value <= 500000) score += 2;

      return {
        value: MONTHLY_KEYWORDS.test(context) && !ANNUAL_KEYWORDS.test(context) ? value * 12 : value,
        score,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.value) && candidate.value > 0);

  const bestCandidate = candidates.sort((a, b) => b.score - a.score)[0];
  return bestCandidate && bestCandidate.score > 0 ? bestCandidate.value : 0;
};

export const extractApplicantData = async (idFile: File, salaryFile: File): Promise<ExtractedApplicantData> => {
  const [rawIdText, rawSalaryText] = await Promise.all([extractTextFromFile(idFile), extractTextFromFile(salaryFile)]);

  const salaryName = extractName(rawSalaryText, "salary");
  const idName = extractName(rawIdText, "id") || salaryName;

  return {
    idName,
    salaryName: salaryName || idName,
    jobTitle: extractJobTitle(rawSalaryText),
    employer: extractEmployer(rawSalaryText),
    annualSalaryUsd: extractAnnualSalaryUsd(rawSalaryText),
    rawIdText,
    rawSalaryText,
  };
};