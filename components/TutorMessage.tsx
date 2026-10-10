"use client";

import { Fragment } from "react";
import QuestionContent from "@/components/question-content/QuestionContent";

/** Small safe Markdown subset: React escapes all model-supplied text. */
export function renderTutorInline(text: string): React.ReactNode {
  const tokens = text.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g);
  return tokens.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={i}>{part.slice(1, -1)}</em>;
    return <QuestionContent key={i} text={part} />;
  });
}

export default function TutorMessage({ text }: { text: string }) {
  const lines = text.split("\n");
  return <div>{lines.map((line, i) => {
    const match = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
    return <Fragment key={i}><div style={{ paddingLeft: match ? 14 : 0 }}>{match ? <span aria-hidden="true">{match[1]} </span> : null}{renderTutorInline(match ? match[2] : line)}</div></Fragment>;
  })}</div>;
}
