export type PracticeTestSectionKey = "english" | "math" | "reading" | "science";
export type PracticeTestModeKey =
  | PracticeTestSectionKey
  | "full-with-science"
  | "full-core";

export type PracticeTestMode = {
  key: PracticeTestModeKey;
  title: string;
  shortLabel: string;
  format: "section" | "full";
  sectionKey?: PracticeTestSectionKey;
  questionCount: number;
  durationMinutes: number;
  accentColor: string;
  constellation: string;
  description: string;
  includesDesmos: boolean;
  scienceOptional: boolean;
  sections: Array<{
    key: PracticeTestSectionKey;
    label: string;
    questionCount: number;
    durationMinutes: number;
  }>;
};

export const SECTION_TESTS: PracticeTestMode[] = [
  {
    key: "english",
    title: "English Practice Test",
    shortLabel: "english",
    format: "section",
    sectionKey: "english",
    questionCount: 50,
    durationMinutes: 35,
    accentColor: "#5DCAA5",
    constellation: "Gemini",
    description: "Production of Writing, Knowledge of Language, and Conventions of Standard English under official ACT timing.",
    includesDesmos: false,
    scienceOptional: false,
    sections: [{ key: "english", label: "English", questionCount: 50, durationMinutes: 35 }],
  },
  {
    key: "math",
    title: "Math Practice Test",
    shortLabel: "math",
    format: "section",
    sectionKey: "math",
    questionCount: 45,
    durationMinutes: 50,
    accentColor: "#AFA9EC",
    constellation: "Aquarius",
    description: "ACT math pacing with room for calculator support and future Desmos integration.",
    includesDesmos: true,
    scienceOptional: false,
    sections: [{ key: "math", label: "Math", questionCount: 45, durationMinutes: 50 }],
  },
  {
    key: "reading",
    title: "Reading Practice Test",
    shortLabel: "reading",
    format: "section",
    sectionKey: "reading",
    questionCount: 36,
    durationMinutes: 40,
    accentColor: "#EF9F27",
    constellation: "Virgo",
    description: "Four ACT passage sets with official pacing for literary narrative, social science, humanities, and natural science.",
    includesDesmos: false,
    scienceOptional: false,
    sections: [{ key: "reading", label: "Reading", questionCount: 36, durationMinutes: 40 }],
  },
  {
    key: "science",
    title: "Science Practice Test",
    shortLabel: "science",
    format: "section",
    sectionKey: "science",
    questionCount: 40,
    durationMinutes: 40,
    accentColor: "#F0997B",
    constellation: "Sagittarius",
    description: "Optional science timing with data representation, research summaries, and conflicting viewpoints.",
    includesDesmos: false,
    scienceOptional: true,
    sections: [{ key: "science", label: "Science", questionCount: 40, durationMinutes: 40 }],
  },
];

export const FULL_TESTS: PracticeTestMode[] = [
  {
    key: "full-with-science",
    title: "Full ACT",
    shortLabel: "full ACT",
    format: "full",
    questionCount: 171,
    durationMinutes: 165,
    accentColor: "#F4F0E8",
    constellation: "Full Sky",
    description: "The full multiple-choice ACT flow with English, Math, Reading, and optional Science in sequence.",
    includesDesmos: true,
    scienceOptional: true,
    sections: [
      { key: "english", label: "English", questionCount: 50, durationMinutes: 35 },
      { key: "math", label: "Math", questionCount: 45, durationMinutes: 50 },
      { key: "reading", label: "Reading", questionCount: 36, durationMinutes: 40 },
      { key: "science", label: "Science", questionCount: 40, durationMinutes: 40 },
    ],
  },
  {
    key: "full-core",
    title: "Core ACT",
    shortLabel: "core ACT",
    format: "full",
    questionCount: 131,
    durationMinutes: 125,
    accentColor: "#D6D3FF",
    constellation: "Core Sky",
    description: "English, Math, and Reading only for students who want the core ACT without Science.",
    includesDesmos: true,
    scienceOptional: true,
    sections: [
      { key: "english", label: "English", questionCount: 50, durationMinutes: 35 },
      { key: "math", label: "Math", questionCount: 45, durationMinutes: 50 },
      { key: "reading", label: "Reading", questionCount: 36, durationMinutes: 40 },
    ],
  },
];

export const PRACTICE_TEST_MODES = [...SECTION_TESTS, ...FULL_TESTS];
