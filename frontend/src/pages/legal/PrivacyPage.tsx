import { Link } from "react-router-dom";

// Plain long-form legal text; intentionally not styled like a product
// surface. Bracketed fields are placeholders for the founder to fill in
// before launch (company identity, DPO contact, retention window).
export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <Link to="/" className="legal-back">
        ← Back
      </Link>

      <h1>Privacy Policy</h1>
      <p className="legal-lede">Last updated: 15 August 2026</p>

      <section>
        <h2>1. Who we are</h2>
        <p>
          This app is operated by [Your Company Name], [Your Address] ("we", "us"). This policy
          explains what personal data we collect when you use the app, why we collect it, and what
          rights you have over it under the EU General Data Protection Regulation (GDPR).
        </p>
      </section>

      <section>
        <h2>2. What data we collect</h2>
        <p>We collect and store the following categories of personal data:</p>
        <ul>
          <li>
            <strong>Account information:</strong> your name, email address, and authentication
            provider (Google Sign-In or email/password).
          </li>
          <li>
            <strong>Goals and preferences:</strong> your training goal, experience level, preferred
            training frequency and session length, unit preference, and any free-text notes you
            provide (e.g. equipment or injury notes).
          </li>
          <li>
            <strong>Workout logs:</strong> the exercises, sets, reps, and weights you record, the
            gyms and machines you use, and the training plans generated for you.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Who processes this data</h2>
        <p>
          We use the following subprocessors, all operated by Google LLC / Google Cloud, to run the
          app:
        </p>
        <ul>
          <li>
            <strong>Firebase Authentication</strong> manages sign-in and stores your account
            credentials (email, hashed password or Google account identifier).
          </li>
          <li>
            <strong>Cloud Firestore</strong> stores your profile, workout logs, gyms, machines,
            and training plans.
          </li>
          <li>
            <strong>Gemini API (Vertex AI)</strong> generates your personalized training plans.
            To do this, your stated goal, free-text notes, and workout history are sent to this
            model so it can tailor a plan to you.
          </li>
        </ul>
        <p>
          These providers may process data on servers outside the European Economic Area. Where
          this is the case, transfers rely on the EU-US Data Privacy Framework and/or Google's
          Standard Contractual Clauses.
        </p>
      </section>

      <section>
        <h2>4. Legal basis for processing</h2>
        <p>
          We process your data to perform the contract formed when you create an account and use
          the app (Art. 6(1)(b) GDPR). Without it, we cannot log your workouts or generate a
          plan for you. Where processing is not strictly necessary to deliver the app (e.g. product
          improvement), we rely on our legitimate interest (Art. 6(1)(f) GDPR) in operating and
          improving the service.
        </p>
      </section>

      <section>
        <h2>5. How long we keep your data</h2>
        <p>
          We keep your account and training data for as long as your account exists. If you delete
          your account, your data is permanently erased from our systems within [Retention Window,
          e.g. 30 days], except where we are required by law to retain certain records for longer.
        </p>
      </section>

      <section>
        <h2>6. Your rights</h2>
        <p>Under the GDPR, you have the right to:</p>
        <ul>
          <li>access the personal data we hold about you;</li>
          <li>have inaccurate data corrected;</li>
          <li>have your data erased;</li>
          <li>receive your data in a portable format;</li>
          <li>restrict or object to certain processing; and</li>
          <li>lodge a complaint with your local data protection supervisory authority.</li>
        </ul>
        <p>
          You can exercise most of these rights directly in the app: use <strong>Export my data</strong>{" "}
          in Profile → Data &amp; privacy to receive a copy of everything we hold about you, and{" "}
          <strong>Delete my account</strong> in the same section to permanently erase your account
          and all associated data. For any other request, contact us using the details below.
        </p>
      </section>

      <section>
        <h2>7. Contact</h2>
        <p>
          For questions about this policy or to make a data protection request, contact us at
          [Data Protection Contact Email].
        </p>
      </section>

      <section>
        <h2>8. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. We will update the date above whenever we
          make changes, and material changes will be communicated in-app.
        </p>
      </section>
    </div>
  );
}
