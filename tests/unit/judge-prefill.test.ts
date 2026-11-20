// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { NewInterview } from "@/components/interview/new-interview";
import { sampleParsedCv } from "@/lib/ai/mock/sampleParsedCv";
import { QUICK_INTERVIEW_MINUTES } from "@/lib/config/constants";
import { send } from "@/lib/utils/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/config/env", () => ({ unpaidAI: false }));
vi.mock("@/lib/supabase/upload", () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/utils/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils/client")>()),
  send: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.mocked(send).mockReset();
});

function renderPractice(
  items: { cvId: string; fileName: string; parseStatus: string }[] = [],
) {
  const client = new QueryClient();
  client.setQueryDefaults(["cvs"], { staleTime: Infinity });
  client.setQueryData(["cvs"], { items });
  render(
    createElement(QueryClientProvider, { client }, createElement(NewInterview)),
  );
}

it("fills blank Judge mode fields and submits the selected CV with edited details", async () => {
  const cvId = "selected-cv";
  const request = vi.mocked(send);
  request.mockResolvedValueOnce({ cvId, parsed: sampleParsedCv });
  renderPractice([
    { cvId, fileName: "Selected CV.pdf", parseStatus: "parsed" },
  ]);

  fireEvent.click(screen.getByText("Use a CV you uploaded before"));
  fireEvent.click(screen.getByRole("button", { name: "Selected CV.pdf" }));
  const judgeMode = await screen.findByRole("checkbox", { name: "Judge mode" });
  const role = screen.getByRole<HTMLInputElement>("combobox", { name: "Role" });
  const company = screen.getByRole<HTMLInputElement>("combobox", {
    name: "Company",
  });
  const jobPost = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: /Job post/,
  });
  fireEvent.change(role, { target: { value: "Platform Engineer" } });

  fireEvent.click(judgeMode);
  expect(request).toHaveBeenCalledTimes(1);
  expect(role.value).toBe("Platform Engineer");
  expect(company.value).toBe("Northstar Labs");
  expect(jobPost.value).toContain("PostgreSQL");

  fireEvent.change(company, { target: { value: "Edited company" } });
  request
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ sessionId: "judge-session" });
  fireEvent.click(
    screen.getByRole("button", { name: "Start your 3 min 30 s interview" }),
  );

  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/sessions",
      "POST",
      expect.objectContaining({
        cvId,
        company: "Edited company",
        roleTitle: "Platform Engineer",
        judgeMode: true,
        lengthMinutes: QUICK_INTERVIEW_MINUTES,
      }),
    ),
  );
});

it("uses a sample CV and hides the Judge mode checkbox without starting the interview", async () => {
  const cvId = "sample-cv";
  const request = vi.mocked(send);
  request.mockResolvedValueOnce({ cvId, parsed: sampleParsedCv });
  renderPractice();

  fireEvent.click(
    screen.getByRole("button", { name: "Use sample CV in Judge mode" }),
  );

  expect(await screen.findByText(sampleParsedCv.full_name)).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: "Judge mode" })).toBeNull();
  expect(
    screen.getByRole<HTMLInputElement>("combobox", { name: "Role" }).value,
  ).toBe("Backend Engineer");
  expect(
    screen.getByRole<HTMLInputElement>("combobox", { name: "Company" }).value,
  ).toBe("Northstar Labs");
  expect(
    screen.getByRole<HTMLTextAreaElement>("textbox", { name: /Job post/ })
      .value,
  ).toContain("PostgreSQL");
  expect(request).toHaveBeenCalledExactlyOnceWith("/api/cv/sample", "POST");

  request
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ sessionId: "judge-session" });
  fireEvent.click(
    screen.getByRole("button", { name: "Start your 3 min 30 s interview" }),
  );

  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/sessions",
      "POST",
      expect.objectContaining({
        cvId,
        company: "Northstar Labs",
        roleTitle: "Backend Engineer",
        judgeMode: true,
        lengthMinutes: QUICK_INTERVIEW_MINUTES,
      }),
    ),
  );
});
