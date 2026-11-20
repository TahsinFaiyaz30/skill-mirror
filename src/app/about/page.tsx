import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Shell } from "@/components/shell/shell";

export const metadata: Metadata = { title: "About" };

// Written like a short note to a nervous candidate, not a feature list:
// acknowledge the stress, show what practice feels like, then reassure.
export default function Page() {
  return (
    <Shell>
      <article className="note">
        <header className="rise">
          <h1>
            Interviews are stressful.
            <br />
            <span className="note-accent">Practice</span> makes them less so.
          </h1>
          <p>
            Most people only get feedback after a real interview, when it&apos;s
            too late to change anything. SkillMirror gives you a safe place to
            practice first, as many times as you like.
          </p>
        </header>

        <section className="rise rise-2">
          <h2>It listens, and asks back</h2>
          <p>
            The interviewer reads your CV and the role you want, then talks with
            you out loud. If an answer is vague, it follows up, just like a
            person would.
          </p>
          <figure className="chat" aria-label="Example conversation">
            <p className="chat-them">
              How would your design handle a sudden traffic spike?
            </p>
            <p className="chat-you">
              I&apos;d put a cache in front of the database.
            </p>
            <p className="chat-them">And what happens when the cache is cold?</p>
            <figcaption>Example conversation</figcaption>
          </figure>
        </section>

        <section className="rise rise-3">
          <h2>Then it tells you, kindly and honestly</h2>
          <p>
            Afterwards you get a score, short video clips of the moments that
            mattered, and one clear thing to do next. You can see how you spoke
            too: your pace, pauses, filler words, eye contact and posture.
          </p>
          <blockquote className="note-quote">
            “You explained trade-offs clearly. Next time, say your answer first,
            then explain.”
            <cite>Example feedback</cite>
          </blockquote>
        </section>

        <section>
          <h2>It stays between you and us</h2>
          <p>
            Your CV is only used to plan your questions. Practice reports are
            private to you, and recordings are deleted after 30 days by default.
            For company interviews, you see what the company receives before you
            start.
          </p>
        </section>

        <footer className="note-end">
          <p>Ready when you are.</p>
          <Link className="button accent lg" href="/dashboard">
            Start with your CV
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </footer>
      </article>
    </Shell>
  );
}
