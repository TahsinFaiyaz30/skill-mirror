import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/shell/brand";
import { cn } from "@/lib/utils/cn";

// Site footer, adapted from the "Footer 01" block: brand and a call to action
// on the left, link columns on the right, a bottom bar, and a large faded
// wordmark. Links point at real SkillMirror pages and landing sections.

const containerWidths = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
};

function Container({
  width = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & { width?: keyof typeof containerWidths }) {
  return (
    <div
      data-slot="container"
      className={cn("mx-auto w-full px-6", containerWidths[width], className)}
      {...props}
    />
  );
}

// A small dot with a soft pulsing halo.
function StatusDot({
  pulse = true,
  className,
  ...props
}: React.ComponentProps<"span"> & { pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("relative flex size-2 shrink-0", className)}
      {...props}
    >
      {pulse && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--orange)]/60 motion-reduce:animate-none" />
      )}
      <span className="relative inline-flex size-full rounded-full bg-[var(--orange)]" />
    </span>
  );
}

const publicColumns = [
  {
    title: "Product",
    links: [
      ["What it does", "/#what-it-does"],
      ["How it works", "/#how-it-works"],
      ["Your report", "/#report"],
      ["Live Docs", "/docs"],
      ["About", "/about"],
    ],
  },
  {
    title: "Teams",
    links: [
      ["For hiring teams", "/#who-its-for"],
      ["Create an opening", "/signup?intent=hiring"],
      ["FAQ", "/#faq"],
    ],
  },
  {
    title: "Account",
    links: [
      ["Interview Studio", "/dashboard"],
      ["Progress", "/progress"],
      ["Log in", "/login"],
      ["Sign up", "/signup"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
  },
] as const;

export default function Footer01({
  authenticated = false,
  homeHref = "/",
  hasOrg = false,
}: {
  authenticated?: boolean;
  homeHref?: string;
  hasOrg?: boolean;
}) {
  const columns = authenticated
    ? [
        {
          title: "Practice",
          links: [
            ["Interview Studio", "/dashboard"],
            ["Progress", "/progress"],
            ["Live Docs", "/docs"],
            ["About", "/about"],
          ],
        },
        ...(hasOrg
          ? [
              {
                title: "Hiring",
                links: [
                  ["Openings", "/hiring"],
                  ["Organization", "/hiring/organization"],
                ],
              },
            ]
          : []),
        {
          title: "Account",
          links: [["Profile settings", "/settings"]],
        },
        {
          title: "Legal",
          links: [
            ["Privacy", "/privacy"],
            ["Terms", "/terms"],
          ],
        },
      ]
    : publicColumns;
  const ctaHref = authenticated ? homeHref : "/signup";
  const ctaLabel =
    authenticated && homeHref === "/hiring"
      ? "Go to openings"
      : "Start practicing";
  return (
    <footer className="site-footer relative overflow-hidden border-t border-[var(--border)]">
      <Container className="pt-16 sm:pt-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div className="flex max-w-sm flex-col gap-6">
            <Link
              href={homeHref}
              className="footer-brand flex items-center gap-2 font-semibold"
            >
              <LogoMark size={26} />
              SkillMirror
            </Link>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Practice job interviews with an AI interviewer that adapts to your
              answers, then see exactly what to improve.
            </p>
            <div>
              <Button
                asChild
                className="footer-cta h-10 rounded-lg bg-[var(--orange)] px-5 font-semibold hover:bg-[var(--orange-hover)]"
              >
                <Link href={ctaHref}>
                  {ctaLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-8 sm:grid-cols-4"
          >
            {columns.map((column) => (
              <div key={column.title}>
                <h3 className="m-0 text-sm font-medium text-[var(--foreground)]">
                  {column.title}
                </h3>
                <ul className="mt-4 flex list-none flex-col gap-3 p-0">
                  {column.links.map(([label, href]) => (
                    <li key={label}>
                      <Link
                        href={href}
                        className="text-sm text-[var(--muted)] no-underline transition-colors hover:text-[var(--foreground)] hover:no-underline"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col-reverse items-start justify-between gap-6 border-t border-[var(--border)] py-8 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-3 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:gap-6">
            <span>© {new Date().getFullYear()} SkillMirror</span>
            <span>International AI Builders Congress 2026</span>
          </div>
          <span className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
            <StatusDot />
            Runs in desktop Chrome or Edge
          </span>
        </div>
      </Container>

      <Container aria-hidden className="pointer-events-none select-none">
        <p className="m-0 -mb-[0.22em] bg-gradient-to-b from-[var(--foreground)]/15 to-transparent bg-clip-text text-center text-[clamp(4rem,15vw,12rem)] leading-none font-semibold tracking-tighter text-transparent">
          SkillMirror
        </p>
      </Container>
    </footer>
  );
}
