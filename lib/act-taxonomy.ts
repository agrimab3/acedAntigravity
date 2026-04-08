import { ACT_TAXONOMY_DATA } from "./act-taxonomy-data";

export type SectionKey = "english" | "math" | "reading" | "science";
export type TopicKind = "practice";

export type ActTopicDefinition = {
  slug: string;
  name: string;
  kind: TopicKind;
  officialCategory?: string;
  shortLabel?: string;
};

export type ActSectionDefinition = {
  key: SectionKey;
  name: string;
  color: string;
  constellation: string;
  topics: ActTopicDefinition[];
};

export const ACT_TAXONOMY = ACT_TAXONOMY_DATA as ActSectionDefinition[];

const taxonomyBySection = new Map(
  ACT_TAXONOMY.map((section) => [section.key, section] as const)
);

export function getSectionDefinition(sectionKey: SectionKey) {
  return taxonomyBySection.get(sectionKey) ?? null;
}

export function getTopicsForSection(sectionKey: SectionKey) {
  return getSectionDefinition(sectionKey)?.topics ?? [];
}

export function getTopicBySlug(sectionKey: SectionKey, slug: string) {
  return getTopicsForSection(sectionKey).find((topic) => topic.slug === slug) ?? null;
}

export function getTopicByName(sectionKey: SectionKey, name: string) {
  return getTopicsForSection(sectionKey).find((topic) => topic.name === name) ?? null;
}

export function getPracticeScopeTopics(sectionKey: SectionKey, topicName: string) {
  const topic = getTopicByName(sectionKey, topicName);

  return topic ? [topic] : [];
}

export function isTopicInPracticeScope(
  sectionKey: SectionKey,
  selectedTopicName: string,
  candidateTopicName: string
) {
  return getPracticeScopeTopics(sectionKey, selectedTopicName).some(
    (topic) => topic.name === candidateTopicName
  );
}
