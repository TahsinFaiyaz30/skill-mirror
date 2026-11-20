"use client";
import { Mail, ExternalLink } from "lucide-react";
import { memberInitials, teamPhotoURL } from "@/lib/docs/assets";
import type { TeamMember } from "@/types/docs";

export function TeamGrid({
  teamName,
  members,
  compact = false,
}: {
  teamName: string;
  members: TeamMember[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wider text-[var(--orange-text)] uppercase">
            Building Team
          </p>
          <h3 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
            {teamName}
          </h3>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--muted)]">
          No team members added yet. Add members from <code>/admin/docs</code>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => {
            const photo = teamPhotoURL(member.photoPath);
            return (
              <article
                key={member.id}
                className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--border-strong)]"
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)]">
                    {photo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={photo}
                        alt={member.name}
                        className="h-full w-full object-cover object-center"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--orange)]/25 via-[var(--surface-2)] to-[var(--surface-3)] text-base font-bold tracking-tight text-[var(--foreground)]">
                        {memberInitials(member.name)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-base font-semibold text-[var(--foreground)]">
                      {member.name}
                    </h4>
                    <p className="mt-0.5 line-clamp-2 text-xs font-medium text-[var(--orange-text)]">
                      {member.role}
                    </p>
                  </div>
                </div>

                {!compact && member.bio && (
                  <p className="mt-3.5 flex-1 text-xs leading-relaxed text-[var(--muted)]">
                    {member.bio}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs">
                  <a
                    href={`mailto:${member.email}`}
                    className="inline-flex min-w-0 items-center gap-1.5 text-[var(--soft)] no-underline hover:text-[var(--foreground)]"
                  >
                    <Mail size={13} className="shrink-0 text-[var(--muted)]" />
                    <span className="truncate">{member.email}</span>
                  </a>
                  {member.github && (
                    <a
                      href={member.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--muted)] no-underline hover:text-[var(--foreground)]"
                    >
                      GitHub
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
