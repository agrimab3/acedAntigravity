"use client";

import { Fragment, useEffect, useRef } from "react";
import styles from "./QuestionContent.module.css";

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

function mapScript(value: string, table: Record<string, string>) {
  return value
    .split("")
    .map((char) => table[char] ?? char)
    .join("");
}

function prettyMath(raw: string) {
  return raw
    .trim()
    .replace(/\\(?:tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, "$1⁄$2")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\^\{([^{}]+)\}/g, (_, value: string) => mapScript(value, SUPERSCRIPT))
    .replace(/\^([0-9+-])/g, (_, value: string) => mapScript(value, SUPERSCRIPT))
    .replace(/_\{([^{}]+)\}/g, (_, value: string) => mapScript(value, SUBSCRIPT))
    .replace(/_([0-9])/g, (_, value: string) => mapScript(value, SUBSCRIPT))
    .replace(/\\geq?|\\ge/g, "≥")
    .replace(/\\leq?|\\le/g, "≤")
    .replace(/\\neq/g, "≠")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\pm/g, "±")
    .replace(/\\pi/g, "π")
    .replace(/\\theta/g, "θ")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\left|\\right/g, "")
    .replace(/\\,/g, " ")
    .replace(/[{}]/g, "");
}

function renderMathAwareText(text: string, keyPrefix: string) {
  const pieces = text.split(/(\\\(.*?\\\)|\\\[.*?\\\]|\$\$.*?\$\$|\$[^$]+\$)/g);

  return pieces.map((piece, index) => {
    const inlineMatch =
      piece.match(/^\\\(([\s\S]*)\\\)$/) ??
      piece.match(/^\$(?!\$)([\s\S]*)\$$/);
    const blockMatch =
      piece.match(/^\\\[([\s\S]*)\\\]$/) ??
      piece.match(/^\$\$([\s\S]*)\$\$$/);

    if (inlineMatch) {
      return (
        <span key={`${keyPrefix}-math-${index}`} className={styles.mathInline}>
          {prettyMath(inlineMatch[1])}
        </span>
      );
    }

    if (blockMatch) {
      return (
        <span key={`${keyPrefix}-math-${index}`} className={styles.mathBlock}>
          {prettyMath(blockMatch[1])}
        </span>
      );
    }

    return <Fragment key={`${keyPrefix}-text-${index}`}>{piece}</Fragment>;
  });
}

export default function QuestionContent({
  text,
  questionNumber,
  activeUnderline = false,
}: {
  text: string;
  questionNumber?: number | string | null;
  activeUnderline?: boolean;
}) {
  const activeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!activeUnderline || !activeRef.current) return;
    const node = activeRef.current;
    const timer = window.setTimeout(() => {
      node.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeUnderline, text, questionNumber]);

  const normalized = text
    .replace(/<u>([\s\S]*?)<\/u>/gi, "[underline]$1[/underline]")
    .replace(/__([\s\S]*?)__/g, "[underline]$1[/underline]");

  const lines = normalized.split("\n");
  const firstUnderlineLineIndex = lines.findIndex((line) => /\[underline\].*?\[\/underline\]/i.test(line));
  const firstUnderlineSegmentIndex =
    firstUnderlineLineIndex >= 0
      ? lines[firstUnderlineLineIndex]
          .split(/(\[underline\][\s\S]*?\[\/underline\])/gi)
          .findIndex((segment) => /^\[underline\][\s\S]*?\[\/underline\]$/i.test(segment))
      : -1;

  return (
    <>
      {lines.map((line, lineIndex) => {
        const segments = line.split(/(\[underline\][\s\S]*?\[\/underline\])/gi);

        return (
          <Fragment key={`line-${lineIndex}`}>
            {segments.map((segment, segmentIndex) => {
              const match = segment.match(/^\[underline\]([\s\S]*?)\[\/underline\]$/i);

              if (match) {
                const isFirstUnderline =
                  lineIndex === firstUnderlineLineIndex &&
                  segmentIndex === firstUnderlineSegmentIndex;

                return (
                  <span
                    key={`underline-${lineIndex}-${segmentIndex}`}
                    ref={isFirstUnderline ? activeRef : undefined}
                    className={
                      activeUnderline && isFirstUnderline
                        ? `${styles.underline} ${styles.activeUnderline}`
                        : styles.underline
                    }
                  >
                    {renderMathAwareText(match[1], `u-${lineIndex}-${segmentIndex}`)}
                    {questionNumber != null ? (
                      <sup className={styles.questionNumber}>{questionNumber}</sup>
                    ) : null}
                  </span>
                );
              }

              return (
                <Fragment key={`segment-${lineIndex}-${segmentIndex}`}>
                  {renderMathAwareText(segment, `s-${lineIndex}-${segmentIndex}`)}
                </Fragment>
              );
            })}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </Fragment>
        );
      })}
    </>
  );
}
