import {Suspense} from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import PublicSite from "@/components/PublicSite";
const legalDraft = (name: string) => readFileSync(path.join(process.cwd(), "docs", "legal-drafts", name), "utf8");
export default function LegalPage(){const documents={terms:legalDraft("01-terms-of-service.md"),privacy:legalDraft("02-privacy-policy.md"),refunds:legalDraft("03-refund-and-payment-policy.md"),"mock-test-rules":legalDraft("04-mock-test-rules.md"),accessibility:legalDraft("05-accessibility-statement.md")};return <Suspense><PublicSite page="legal" legalDocuments={documents}/></Suspense>}
