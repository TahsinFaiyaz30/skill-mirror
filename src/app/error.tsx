"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="container page narrow"><section className="card stack"><h1>Something went wrong</h1><p className="muted">Try loading this page again.</p><div><button className="button" onClick={reset}>Try again</button></div></section></main>;
}
