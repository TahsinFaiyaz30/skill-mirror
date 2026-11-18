import type { FeedbackVisibility } from "@/types/interview";
import type { CandidateSummary, ReportData } from "@/types/report";
export function filterForCandidate(
  report: ReportData | null,
  visibility: FeedbackVisibility,
): ReportData | CandidateSummary | null {
  if (!report || visibility === "none") return null;
  if (visibility === "summary")
    return {
      summary: {
        strengths: report.summaryLists.strengths.slice(0, 2),
        growthAreas: report.summaryLists.growthAreas.slice(0, 2),
      },
      practicePlan: report.practicePlan,
    };
  const { companyView: privateDetails, ...shared } = report;
  void privateDetails;
  return {
    ...shared,
    integrity: { badge: report.integrity.badge },
    timeline: {
      ...report.timeline,
      events: report.timeline.events.filter(
        (item) => !["integrity", "live_vision"].includes(item.category),
      ),
    },
    keyMoments: report.keyMoments.filter(
      (item) => !["integrity", "live_vision"].includes(item.category),
    ),
    turns: report.turns.map((turn) => {
      if (!turn.scores || !("note" in turn.scores)) return turn;
      const { note, ...scores } = turn.scores;
      void note;
      return { ...turn, scores };
    }),
  };
}
