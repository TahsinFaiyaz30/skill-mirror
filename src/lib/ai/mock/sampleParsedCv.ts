import type { ParsedCV } from "@/types/interview";
export const sampleParsedCv: ParsedCV = {
  full_name: "Jamie Morgan",
  headline: "Software engineer building reliable services",
  total_years_experience: 4,
  seniority_estimate: "mid",
  skills: [
    {
      name: "TypeScript",
      category: "language",
      proficiency_claimed: "advanced",
      evidence: "Led the TypeScript migration of the payments service.",
    },
    {
      name: "Databases & SQL",
      category: "domain",
      proficiency_claimed: "advanced",
      evidence: "Designed transactional data models and tuned SQL queries.",
    },
    {
      name: "System Design",
      category: "domain",
      proficiency_claimed: "intermediate",
      evidence: "Designed a queued delivery pipeline with retries.",
    },
    {
      name: "Backend & APIs",
      category: "domain",
      proficiency_claimed: "advanced",
      evidence: "Owned the versioned partner API.",
    },
  ],
  experience: [
    {
      company: "Northstar Labs",
      title: "Software Engineer",
      start: "2022-01",
      end: "present",
      highlights: [
        "Owned partner API reliability",
        "Mentored new team members",
      ],
    },
  ],
  projects: [
    {
      name: "Payments Reliability",
      description:
        "Made payment processing reliable across retries and partial failures.",
      tech: ["TypeScript", "Databases & SQL"],
      role: "Technical lead",
      impact: "Reduced duplicate requests and incident volume.",
    },
  ],
  education: [
    {
      institution: "Northstar University",
      degree: "BSc Computer Science",
      year: "2021",
    },
  ],
  leadership_signals: [
    "Owned a production service",
    "Mentored junior engineers",
  ],
  risks_or_gaps: ["Limited evidence of organization-wide leadership"],
  links: { github: [], linkedin: "", portfolio: "" },
  skills_removed: [],
};
