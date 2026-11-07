import { Link } from "react-router-dom";

const CONTACT_EMAIL = "CONTACT_EMAIL_TO_CONFIRM";
const LAST_UPDATED = "November 6, 2026";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-10">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

const Bullets = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-2 pl-5">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

const Privacy = () => (
  <main className="min-h-screen bg-background px-6 py-16">
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="text-sm text-primary hover:underline">
        ← Back to FocalPoint
      </Link>

      <h1 className="mt-6 text-3xl font-bold text-foreground">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        During a focus session, FocalPoint checks the pages you visit against your goal using AI. To
        do that, information about those pages leaves your browser. This policy explains what is
        sent, where it goes, how long it is kept, and how to control it.
      </p>

      <Section title="What the extension sends during a session">
        <p>For each page it checks, the extension sends the FocalPoint server:</p>
        <Bullets
          items={[
            "The web address, without its query string or fragment (the parts after ? and #)",
            "The page title",
            "Up to 500 characters of text from the page",
            "Your session goal and blocking sensitivity",
          ]}
        />
        <p>
          The server forwards the address, title, text, and goal to Anthropic, whose Claude AI
          decides whether the page matches your goal. Nothing is checked when no session is active.
        </p>
      </Section>

      <Section title="Pages the extension does not send">
        <p>The extension allows these pages without sending anything about them:</p>
        <Bullets
          items={[
            "Sites on a built-in list of banking, health, email, password manager, and government services",
            "Local and private network addresses",
            "Pages containing a password field",
            "Any domain you add to your private list in the extension",
          ]}
        />
        <p>
          The built-in list cannot include every sensitive site. Add any others you use to your
          private list, or end your session before visiting them.
        </p>
      </Section>

      <Section title="What we store">
        <Bullets
          items={[
            "Account: username, email, a hashed password, and your preferences",
            "Sessions: your goal, start and end times, sensitivity, and block and override counts",
            "Saved decisions: the AI's decision and one-sentence reason, stored under a scrambled key for 24 hours and shared by anyone using the same page, goal, and sensitivity",
          ]}
        />
        <p>
          Session history does not include the addresses of pages you visited. The AI's reason can
          describe what a page is about. We do not write page addresses, titles, text, or reasons
          to our server logs on purpose.
        </p>
        <p>
          Your private list and consent choice are stored only in your browser, and stay there
          after you sign out.
        </p>
      </Section>

      <Section title="Who else handles this data">
        <Bullets
          items={[
            "Anthropic processes page checks. Under its current API terms, inputs and outputs are generally deleted within 30 days and are not used to train its models by default. Content flagged for policy violations can be kept longer.",
            "Our hosting, database, and caching providers store and run the service on our behalf.",
          ]}
        />
        <p>
          We do not sell your data or use it for advertising. We may disclose data if the law
          requires it.
        </p>
      </Section>

      <Section title="Your choices">
        <Bullets
          items={[
            "End a session at any time to stop page checks",
            "Add domains to your private list so they are never sent",
            `Email ${CONTACT_EMAIL} to request a copy of your data or to delete your account and sessions`,
            "Remove the extension to stop all collection",
          ]}
        />
      </Section>

      <Section title="Changes and contact">
        <p>
          We will update this page and its date when our practices change. Questions go to{" "}
          {CONTACT_EMAIL}.
        </p>
      </Section>
    </div>
  </main>
);

export default Privacy;
