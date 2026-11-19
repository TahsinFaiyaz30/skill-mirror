import type { GithubProject } from "@/types/interview";

export function repositoryPath(link: string) {
  try {
    const url = new URL(link);
    const [empty, owner, repo, ...rest] = url.pathname
      .replace(/\/$/, "")
      .split("/");
    if (
      empty !== "" ||
      rest.length ||
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      !/^[A-Za-z\d][A-Za-z\d-]{0,38}$/.test(owner ?? "") ||
      !/^[\w.-]{1,100}$/.test(repo ?? "") ||
      /^[.]{1,2}$/.test(repo)
    )
      return null;
    return owner + "/" + repo;
  } catch {
    return null;
  }
}
export async function enrichProjects(
  urls: string[],
  token?: string,
): Promise<GithubProject[]> {
  const repos = [
    ...new Set(
      urls
        .map(repositoryPath)
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 3);
  const projects = await Promise.all(
    repos.map(async (path) => {
      const request = (
        suffix: string,
        accept = "application/vnd.github+json",
      ) =>
        fetch("https://api.github.com/repos/" + path + suffix, {
          headers: {
            Accept: accept,
            ...(!suffix && token && { Authorization: "Bearer " + token }),
          },
          signal: AbortSignal.timeout(4000),
          redirect: "error",
        })
          .then((res) => (res.ok ? res : null))
          .catch(() => null);
      try {
        const repo = await request("");
        if (!repo) return null;
        const details = (await repo.json()) as {
          private: boolean;
          visibility?: string;
          name: string;
          description: string | null;
          topics?: string[];
          language?: string;
          stargazers_count?: number;
          pushed_at?: string;
        };
        if (
          details.private !== false ||
          (details.visibility && details.visibility !== "public")
        )
          return null;
        const [languages, readme] = await Promise.all([
          request("/languages"),
          request("/readme", "application/vnd.github.raw+json"),
        ]);
        const languageNames = languages
          ? Object.keys(await languages.json())
          : [];
        let excerpt = "";
        if (readme?.body) {
          const reader = readme.body.getReader(),
            decoder = new TextDecoder();
          try {
            while (excerpt.length < 4000) {
              const chunk = await reader.read();
              if (chunk.done) break;
              excerpt += decoder.decode(chunk.value, { stream: true });
            }
          } finally {
            void reader.cancel();
          }
        }
        const summary = [
          details.description,
          details.topics?.join(", "),
          [details.language, ...languageNames].filter(Boolean).join(", "),
          details.stargazers_count === undefined
            ? ""
            : "Stars: " + details.stargazers_count,
          details.pushed_at ? "Last pushed: " + details.pushed_at : "",
          excerpt.slice(0, 4000),
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1500);
        return {
          url: "https://github.com/" + path,
          name: details.name || path,
          summary,
        };
      } catch {
        return null;
      }
    }),
  );
  return projects.filter((value): value is GithubProject => value !== null);
}
