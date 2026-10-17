"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import "./legal-content.css";

export const LEGAL_TABS = [
  ["terms", "Terms"],
  ["privacy", "Privacy"],
  ["refunds", "Refunds"],
  ["mock-test-rules", "Mock Test Rules"],
  ["accessibility", "Accessibility"],
] as const;

type Tab = (typeof LEGAL_TABS)[number][0];
type ParsedDocument = { title: string; effectiveDate: string; lastUpdated: string; sections: Array<{ heading: string; paragraphs: string[] }> };

const slug = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function parseDocument(source: string): ParsedDocument {
  const result: ParsedDocument = { title: "Aced Legal", effectiveDate: "", lastUpdated: "", sections: [] };
  let current: { heading: string; paragraphs: string[] } | null = null;
  let paragraph: string[] = [];
  const flush = () => {
    if (current && paragraph.length) current.paragraphs.push(paragraph.join(" "));
    paragraph = [];
  };
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("# ")) { result.title = line.slice(2); continue; }
    if (line.startsWith("**Effective Date:**")) { result.effectiveDate = line.replace(/^\*\*Effective Date:\*\*\s*/, ""); continue; }
    if (line.startsWith("**Last Updated:**")) { result.lastUpdated = line.replace(/^\*\*Last Updated:\*\*\s*/, ""); continue; }
    if (line.startsWith("## ")) {
      flush();
      current = { heading: line.slice(3), paragraphs: [] };
      result.sections.push(current);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    paragraph.push(line);
  }
  flush();
  return result;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>;
}

export default function LegalContent({ documents }: { documents: Record<Tab, string> }) {
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = LEGAL_TABS.some(([key]) => key === requested) ? requested as Tab : "terms";
  const document = useMemo(() => parseDocument(documents[tab] || "# Aced Legal"), [documents, tab]);
  return <><section className="legalHero"><span className="kick">legal</span><h1>the fine print</h1><p>Terms, privacy, payments, mock-test rules, and accessibility.</p><div className="legalTabs">{LEGAL_TABS.map(([key, label]) => <Link key={key} href={`/legal?tab=${key}`} className={key === tab ? "activeLegal" : ""}>{label}</Link>)}</div></section><section className="narrow legalWrap"><article className="card legalCard"><aside><span>on this page</span><nav aria-label="On this page">{document.sections.map((section, index) => <a key={section.heading} href={`#${slug(section.heading)}`}><i>{index + 1}</i>{section.heading}</a>)}</nav></aside><div className="legalText"><header><h2>{document.title}</h2>{document.effectiveDate && <small>Effective Date: {document.effectiveDate}</small>}{document.lastUpdated && <small>Last Updated: {document.lastUpdated}</small>}</header>{document.sections.map((section, index) => <section key={section.heading}><h3 id={slug(section.heading)}><i>{index + 1}.</i>{section.heading}</h3>{section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}><Inline text={paragraph} /></p>)}</section>)}</div></article></section></>;
}
