import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalList,
  LegalP,
  LegalSection,
  LegalShell,
} from "@/components/legal/LegalShell";
import {
  TRAFFIC_RETENTION_DAYS,
  VISITOR_COOKIE_MAX_DAYS,
  VISITOR_COOKIE_NAME,
} from "@/lib/legal";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Cookies",
  description:
    "Cookies and browser storage on AI Judge: the aij_vid visitor cookie, Auth.js session cookies, and local OpenRouter key storage. No consent banner.",
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <LegalShell
      kicker="Lab policy"
      title="Cookies"
      lede="This site uses a small first-party visitor cookie, login cookies if you sign in, and browser storage for your OpenRouter key. There is no cookie banner. Do Not Track and Global Privacy Control are respected for analytics."
    >
      <LegalSection id="summary" title="Short version">
        <LegalList
          items={[
            "We set first-party cookies only. No Google Analytics, ads, or other tracker pixels in this app.",
            `Anonymous visits use a cookie named ${VISITOR_COOKIE_NAME}.`,
            "Signing in with Discord adds Auth.js session cookies.",
            "Your OpenRouter key is stored in this browser, not in a cookie.",
            "Send DNT or GPC and we skip the visit beacon.",
          ]}
        />
      </LegalSection>

      <LegalSection id="visitor" title="Visitor cookie">
        <LegalP>
          <span className="font-mono text-bright">{VISITOR_COOKIE_NAME}</span>{" "}
          is a random 32-character token. It is not your Discord id. It is
          httpOnly, SameSite=Lax, path=/, and lasts about{" "}
          {VISITOR_COOKIE_MAX_DAYS} days. In production it is marked Secure.
        </LegalP>
        <LegalP>
          We hash the token (SHA-256) and count one unique per UTC day plus a
          page-path tally. We do not store IP, user agent, or referrer. Path
          query strings are dropped; ids in the path become{" "}
          <span className="font-mono">:id</span>. Those rollups are deleted
          after about {TRAFFIC_RETENTION_DAYS} days. Staff see totals on
          /admin.
        </LegalP>
        <LegalP>
          The cookie is set when the visit beacon runs. If your browser sends
          Do Not Track or Sec-GPC, this site does not send that beacon.
        </LegalP>
      </LegalSection>

      <LegalSection id="auth" title="Sign-in cookies">
        <LegalP>
          Discord login uses Auth.js (NextAuth). Typical cookie names are{" "}
          <span className="font-mono">authjs.session-token</span>, a CSRF
          cookie, and short-lived callback / PKCE cookies during the Discord
          redirect. On HTTPS they may be prefixed{" "}
          <span className="font-mono">__Secure-</span> or{" "}
          <span className="font-mono">__Host-</span>. We do not rename them in
          this codebase.
        </LegalP>
        <LegalP>
          Those cookies are needed to stay signed in. They are not used for
          advertising. Clear them by signing out or clearing site data.
        </LegalP>
      </LegalSection>

      <LegalSection id="storage" title="Browser storage (not cookies)">
        <LegalList
          items={[
            <>
              <span className="font-mono text-bright">
                ai-judge:openrouter-key
              </span>{" "}
              in localStorage — your full OpenRouter key. Sent to this server
              as <span className="font-mono">x-openrouter-key</span> for model
              calls. Never written to the database.
            </>,
            <>
              <span className="font-mono text-bright">
                ai-judge:show-judge-streams
              </span>{" "}
              in localStorage — a UI preference.
            </>,
            <>
              <span className="font-mono text-bright">ai-judge:run-draft</span>{" "}
              in sessionStorage — the configure-run wizard draft for this tab.
            </>,
            <>
              <span className="font-mono text-bright">
                ai-judge:bundle-rules-ack
              </span>{" "}
              in sessionStorage — remembers you read bundle rules in this tab.
              The older key{" "}
              <span className="font-mono">ai-judge:pack-rules-ack</span> still
              counts as acknowledged.
            </>,
          ]}
        />
        <LegalP>
          Clearing site data for this origin removes the key and the
          preferences. That does not delete public runs or chats already on
          the server.
        </LegalP>
      </LegalSection>

      <LegalSection id="third" title="Other people’s cookies">
        <LegalP>
          Discord’s login and avatar CDN are Discord’s services. OpenRouter is
          called from this server with your key — that is not a cookie we set
          in your browser, but OpenRouter will see the request. Their policies
          apply when you use those features.
        </LegalP>
        <LegalP>
          Fonts are loaded through Next.js. This app does not drop a Google
          Analytics cookie.
        </LegalP>
      </LegalSection>

      <LegalSection id="choice" title="Your choices">
        <LegalList
          items={[
            "Turn on Do Not Track or Global Privacy Control to skip visit beacons.",
            "Use the browser’s site-data controls to delete cookies and localStorage.",
            "Do not sign in if you do not want a session cookie.",
            "Do not paste a key if you do not want it in localStorage.",
            "There is no in-app cookie settings panel and no consent banner — by design, for this hobby lab.",
          ]}
        />
        <LegalP>
          More on what we store: <Link href="/privacy">Privacy</Link>. The
          house rules: <Link href="/terms">Terms</Link>.
        </LegalP>
      </LegalSection>
    </LegalShell>
  );
}