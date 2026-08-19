export type MasteryId = "aware" | "understand" | "calculate" | "master";

export type MasteryLevel = {
  id: MasteryId;
  label: string;
  description: string;
};

export type KnowledgePoint = {
  id: string;
  sequence: number;
  description: string;
};

export type KnowledgeSemester = {
  id: "upper" | "lower";
  label: "上册" | "下册";
  points: KnowledgePoint[];
};

export type KnowledgeGrade = {
  id: string;
  order: number;
  label: string;
  stage: "小学" | "初中";
  pointCount: number;
  semesters: KnowledgeSemester[];
};

export type KnowledgeTowerCatalog = {
  schemaVersion: 1;
  catalogId: string;
  title: "数学知识塔";
  language: "zh-CN";
  knowledgePointCount: 517;
  totalLights: 2068;
  masteryLevels: MasteryLevel[];
  grades: KnowledgeGrade[];
};

export type EquivalentAge = {
  years: number;
  months: number;
  days: number;
  progressDays: number;
  label: string;
};

export type KnowledgeTowerProgress = {
  schemaVersion: 1;
  id: string;
  catalogId: string;
  createdAt: string;
  updatedAt: string;
  litLightIds: string[];
  litCount: number;
  score: number;
  totalLights: number;
  maxScore: number;
  progressRatio: number;
  progressPercent: number;
  equivalentAge: EquivalentAge;
};

export type KnowledgeTowerResponse = {
  catalog: KnowledgeTowerCatalog;
  progress: KnowledgeTowerProgress;
};

export type LightMutationResponse = {
  isLit: boolean;
  progress: KnowledgeTowerProgress;
};
