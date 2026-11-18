export const ROLE_FAMILIES = ["software_engineering", "data_ml", "product", "design", "other"] as const;
export const SENIORITIES = ["intern", "junior", "mid", "senior", "staff"] as const;
export const PHASES = ["intro_calibration", "cv_deep_dive", "behavioral", "technical", "presentation", "candidate_questions", "close"] as const;
export const QUESTION_PHASES = ["cv_deep_dive", "behavioral", "technical"] as const;
export const OPTIONAL_PHASES = ["cv_deep_dive", "behavioral", "technical", "presentation", "candidate_questions"] as const;
export const PHASE_LABELS = {
  intro_calibration: "Intro", cv_deep_dive: "Your experience", behavioral: "Behavioral",
  technical: "Technical", presentation: "Presentation", candidate_questions: "Your questions", close: "Wrap-up",
};
const engineering = "software_engineering";
const data = "data_ml";
export const TAXONOMY = {
  dsa: ["Data Structures & Algorithms", engineering, data],
  system_design: ["System Design", engineering],
  distributed_systems: ["Distributed Systems", engineering],
  databases: ["Databases & SQL", engineering, data],
  backend_apis: ["Backend & APIs", engineering],
  frontend_web: ["Frontend & Web Platform", engineering, "design"],
  mobile: ["Mobile Development", engineering],
  cloud_devops: ["Cloud & DevOps", engineering],
  security: ["Security", engineering],
  testing_quality: ["Testing & Code Quality", engineering],
  os_networking: ["OS & Networking", engineering],
  concurrency: ["Concurrency & Performance", engineering],
  language_depth: ["Language Depth", engineering],
  ml_fundamentals: ["ML Fundamentals", data],
  deep_learning: ["Deep Learning", data],
  llm_engineering: ["LLM & GenAI Engineering", data, engineering],
  data_engineering: ["Data Engineering", data],
  statistics: ["Statistics & Experimentation", data, "product"],
  analytics_sql: ["Analytics", data, "product"],
  product_sense: ["Product Sense", "product"],
  product_execution: ["Execution & Metrics", "product"],
  strategy: ["Strategy & Prioritization", "product"],
  ux_research: ["UX Research", "design"],
  interaction_design: ["Interaction & Visual Design", "design"],
  domain_other: ["Role-specific", "other"],
} as const;
export type CompetencyKey = keyof typeof TAXONOMY;
export const COMPETENCY_KEYS = Object.keys(TAXONOMY) as CompetencyKey[];
export const THEMES = ["leadership", "ownership", "conflict", "failure_learning", "ambiguity", "collaboration"] as const;
export const DIMENSIONS = ["executive_presence", "composure", "clarity_structure", "engagement", "ownership", "persuasion", "vocal_confidence"] as const;
export const readable = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
