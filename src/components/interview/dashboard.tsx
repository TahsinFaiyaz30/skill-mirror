"use client";
import { NewInterview } from "./new-interview";

// The dashboard starts with one thing: upload your CV. Everything else about
// the interview appears after the CV is read. Unfinished interviews and
// company invitations are on the Progress page.
export function Dashboard({ firstName }: { firstName: string }) {
  return <NewInterview firstName={firstName} />;
}
