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
  DISCORD_PRIVACY_URL,
  OPENROUTER_PRIVACY_URL,
  OPERATOR_NAME,
  TRAFFIC_RETENTION_DAYS,
  VISITOR_COOKIE_NAME,
} from "@/lib/legal";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Privacy",
  description:
    "How AI Judge handles Discord identity, public lab records, visitor counts, and your OpenRouter key. A personal project by MiMs.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalShell
      kicker="Lab policy"
      title="Privacy"
      lede="AI Judge is a personal benchmark lab run by MiMs — not a company and not a private workspace. This page says what we store, what is public, and what we do not do."
    >
      <LegalSection id="who" title="Who runs this">
        <LegalP>
          The operator is {OPERATOR_NAME}, a person. There is no registered
          company behind this site. Contact is Discord only:{" "}
          <a href={CONTACT_DISCORD_URL}>
            {CONTACT_DISCORD_NAME}
          </a>{" "}
          <span className="font-mono text-dim">({CONTACT_DISCORD_ID})</span>.
        </LegalP>
        <LegalP>
          This is plain language for a hobby lab, not formal legal advice.
        </LegalP>
      </LegalSection>

      <LegalSection id="age" title="Age">
        <LegalP>
          You must be at least 13. Discord’s own rules also apply. If you are
          under 18, get a parent or guardian’s okay before you paste an
          OpenRouter key — that key can spend real money.
        </LegalP>
      </LegalSection>

      <LegalSection id="account" title="What we store when you sign in">
        <LegalP>
          Sign-in is Discord, identify scope only. We do not ask for your email
          and we do not store one.
        </LegalP>
        <LegalList
          items={[
            "Discord id, username, and avatar URL",
            "A role on this site (user, moderator, or admin)",
            "When the account was created",
            "A signed-in session cookie so you stay logged in",
          ]}
        />
        <LegalP>
          Signing out clears the session cookie. Revoking the Discord app in
          Discord’s settings stops future logins.
        </LegalP>
      </LegalSection>

      <LegalSection id="public" title="Lab records are public">
        <LegalP>
          This is a shared instrument, not a private notebook. If you put
          something in a run, a playground chat, or a published pack, treat it
          as public.
        </LegalP>
        <LegalList
          items={[
            "Benchmark runs — listed on /runs. Snapshots, live workbenches, and JSON/CSV exports are open. Anyone who knows the run id can read answers and judge text. Only pause, resume, cancel, and retry stay locked to the person who launched the run.",
            "Leaderboards, compare, and judges pages — built from every complete run on this host.",
            "Playground chats — no login required. Transcripts and judgments are stored. Recent sessions are listed. Anyone with the session link can read them.",
            "Published packs — listed on /bundles with your Discord name and avatar. Drafts stay visible only to you until you publish. Published packs cannot be edited or deleted.",
          ]}
        />
        <LegalP>
          Do not paste secrets, private keys, personal data about other people,
          or anything you would not put on a public noticeboard.
        </LegalP>
      </LegalSection>

      <LegalSection id="key" title="Your OpenRouter key">
        <LegalP>
          In production you paste your own key. It lives in this browser’s
          localStorage, is sent to this server only to call OpenRouter, and is
          held in process memory while a run or chat is live. It is not written
          to SQLite, not put in the session, and not shown back to you except
          the last four characters.
        </LegalP>
        <LegalP>
          Discord never receives the key. This site does not bill you.
          OpenRouter bills the key. Read{" "}
          <a href={OPENROUTER_PRIVACY_URL} rel="noreferrer">
            OpenRouter’s privacy policy
          </a>
          .
        </LegalP>
      </LegalSection>

      <LegalSection id="models" title="What we send to model providers">
        <LegalP>
          When you launch a run, chat, test a key, refresh the catalog, or
          generate a pack, this server sends prompts and model output to
          OpenRouter using your key (or a server key in local/dev mode). That
          includes task text, candidate answers, judge prompts, and playground
          transcripts.
        </LegalP>
        <LegalP>
          Those providers have their own logs and policies. We do not control
          them.
        </LegalP>
      </LegalSection>

      <LegalSection id="traffic" title="Visitor counts">
        <LegalP>
          Most page views send a tiny beacon to this site. We store a daily
          path count and a hashed visitor token — not your IP, user agent,
          referrer, or Discord id. Paths are stripped of query strings; ids in
          the path are collapsed. Rollups are kept about {TRAFFIC_RETENTION_DAYS}{" "}
          days, then deleted. Staff can see those totals on /admin.
        </LegalP>
        <LegalP>
          The visitor cookie is named{" "}
          <span className="font-mono text-bright">{VISITOR_COOKIE_NAME}</span>.
          If your browser sends Do Not Track or Global Privacy Control, the
          site does not send the beacon. Details are on{" "}
          <Link href="/cookies">Cookies</Link>.
        </LegalP>
      </LegalSection>

      <LegalSection id="settings" title="Shared lab settings">
        <LegalP>
          Concurrency, trials, budget, and timeout defaults are one shared row
          for this host — not per account. Any signed-in user can change them.
          They are operator knobs, not personal preferences.
        </LegalP>
      </LegalSection>

      <LegalSection id="third" title="Other services">
        <LegalList
          items={[
            <>
              Discord — login and avatar images.{" "}
              <a href={DISCORD_PRIVACY_URL} rel="noreferrer">
                Discord privacy
              </a>
              .
            </>,
            <>
              OpenRouter — model calls and catalog.{" "}
              <a href={OPENROUTER_PRIVACY_URL} rel="noreferrer">
                OpenRouter privacy
              </a>
              .
            </>,
            "The machine that hosts this app may keep ordinary server logs (that is outside this codebase).",
          ]}
        />
      </LegalSection>

      <LegalSection id="keep" title="We do not delete lab records">
        <LegalP>
          There is no “delete my account” or “forget me” button, and we do not
          promise to erase runs, chats, published packs, or scores if you ask.
          Those rows are the lab’s public record. The leaderboard only stays
          honest if completed work remains.
        </LegalP>
        <LegalP>
          You can stop using the site, remove your OpenRouter key from this
          browser, and revoke Discord access. Visitor hashes age out on their
          own. Session cookies go away when you sign out or they expire.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <LegalP>
          If this page changes in a way that matters, the date at the top
          updates. Keep using the site after that and you are using the new
          version.
        </LegalP>
      </LegalSection>
    </LegalShell>
  );
}
