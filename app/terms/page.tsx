import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalList,
  LegalP,
  LegalSection,
  LegalShell,
} from "@/components/legal/LegalShell";
import {
  CONTACT_DISCORD_ID,
  CONTACT_DISCORD_NAME,
  CONTACT_DISCORD_URL,
  DISCORD_TERMS_URL,
  OPENROUTER_TERMS_URL,
  OPERATOR_NAME,
} from "@/lib/legal";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Terms",
  description:
    "Terms for using AI Judge: a personal public lab, Discord sign-in, OpenRouter billing, and 13+ access. Operated by MiMs.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalShell
      kicker="Lab policy"
      title="Terms"
      lede="Use AI Judge as a public bench, not a private product. These terms are written in ordinary English for a personal project."
    >
      <LegalSection id="agreement" title="The deal">
        <LegalP>
          By using https://ai-judge.genxmims.org you agree to these terms and
          to the <Link href="/privacy">Privacy</Link> and{" "}
          <Link href="/cookies">Cookies</Link> pages. If you do not agree, do
          not use the lab.
        </LegalP>
        <LegalP>
          {OPERATOR_NAME} runs this as a hobby. It is not a company, not a
          paid service, and not a certified benchmark bureau.
        </LegalP>
      </LegalSection>

      <LegalSection id="age" title="Who may use it">
        <LegalP>
          You must be at least 13. Discord’s terms also apply when you sign
          in. If you are under 18, you need a parent or guardian’s permission
          before you spend money through an OpenRouter key.
        </LegalP>
      </LegalSection>

      <LegalSection id="the-lab" title="What this site is">
        <LegalList
          items={[
            "A shared bench that sends versioned prompt packs to models, runs validators, and scores answers with a seeded blind judge panel.",
            "A public leaderboard built from scored, non-cancelled runs on this host.",
            "A playground for shorter judged chats.",
            "Not legal, medical, or safety advice. Not an official ranking of any vendor.",
          ]}
        />
      </LegalSection>

      <LegalSection id="public" title="You are publishing">
        <LegalP>
          Runs, playground chats, published packs, and leaderboard scores are
          public lab records. Other people can read them. Only run controls
          (pause, resume, cancel, retry) are limited to the launcher. Pack
          drafts stay yours until you publish; published packs cannot be
          edited or deleted.
        </LegalP>
        <LegalP>
          You grant {OPERATOR_NAME} a worldwide, royalty-free permission to
          host, display, and keep that material on this lab so the board stays
          reproducible. You still own what you wrote. You promise it is yours
          to publish and that it does not break the law or these terms.
        </LegalP>
      </LegalSection>

      <LegalSection id="key" title="Your key, your bill">
        <LegalP>
          Model calls go through OpenRouter. In production you bring your own
          key. This site does not sell credits and does not refund OpenRouter
          spend. You are responsible for that bill and for keeping the key
          safe in your browser.
        </LegalP>
        <LegalP>
          OpenRouter’s{" "}
          <a href={OPENROUTER_TERMS_URL} rel="noreferrer">
            terms
          </a>{" "}
          apply to those calls. Discord’s{" "}
          <a href={DISCORD_TERMS_URL} rel="noreferrer">
            terms
          </a>{" "}
          apply to login.
        </LegalP>
      </LegalSection>

      <LegalSection id="conduct" title="Do not">
        <LegalList
          items={[
            "Break the law or ask the lab to help you break it.",
            "Write sexual content involving minors, or tasks about weapons, pathogens, or crime-as-the-job — including in custom packs.",
            "Try to break, scrape destructively, or overload the host.",
            "Impersonate staff, probe other people’s keys, or treat this as a private API for a product you sell without asking.",
            "Paste secrets, other people’s personal data, or anything you need to stay confidential.",
            "Use output as if a human signed it. Model text is untrusted.",
          ]}
        />
        <LegalP>
          {OPERATOR_NAME} may hide content, pause a run, or block an account
          that breaks this. There is no appeal process beyond Discord.
        </LegalP>
      </LegalSection>

      <LegalSection id="settings" title="Shared knobs">
        <LegalP>
          Default concurrency, trials, budget, and timeouts are shared for
          everyone on this host. Changing them in Settings changes the lab,
          not only your session. Be careful.
        </LegalP>
      </LegalSection>

      <LegalSection id="availability" title="No uptime promise">
        <LegalP>
          The lab can be down, slow, wiped, moved, or shut off. Runs can fail
          mid-stream. Scores can be wrong. Seeds and hashes are there so you
          can see what happened — not so we guarantee a result.
        </LegalP>
      </LegalSection>

      <LegalSection id="liability" title="As-is">
        <LegalP>
          The site is provided as-is, with no warranty of any kind. To the
          extent the law allows, {OPERATOR_NAME} is not liable for lost money
          (including OpenRouter spend), lost data, or anything you do with
          model output. If a court ever finds a liability that cannot be
          disclaimed, it is limited to zero — this is a free personal project.
        </LegalP>
      </LegalSection>

      <LegalSection id="law" title="If we disagree">
        <LegalP>
          Talk to {OPERATOR_NAME} on Discord first (
          <a href={CONTACT_DISCORD_URL}>{CONTACT_DISCORD_NAME}</a>, id{" "}
          <span className="font-mono">{CONTACT_DISCORD_ID}</span>).
        </LegalP>
        <LegalP>
          This is not a registered company, so these terms do not name a
          country. If a court is ever required, the laws of the operator&apos;s
          place of residence apply, and that is the venue. We are saying that
          plainly because a hobby lab should not pretend to be a Delaware
          corporation.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <LegalP>
          These terms can change. The date at the top is the version you are
          looking at. Keep using the site after a change and you accept the
          new terms.
        </LegalP>
      </LegalSection>
    </LegalShell>
  );
}
