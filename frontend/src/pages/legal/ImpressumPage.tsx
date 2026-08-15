import { Link } from "react-router-dom";

// Plain long-form legal text; intentionally not styled like a product
// surface. Every bracketed field is a placeholder for the founder to fill
// in with real company details before launch; do not replace these with
// invented data.
export default function ImpressumPage() {
  return (
    <div className="legal-page">
      <Link to="/" className="legal-back">
        ← Back
      </Link>

      <h1>Impressum</h1>
      <p className="legal-lede">Angaben gemäß § 5 TMG (information required under German law)</p>

      <section>
        <h2>Company</h2>
        <p>
          [Your Company Name] ([Legal Form, e.g. GmbH])
          <br />
          [Street Address]
          <br />
          [Postal Code] [City]
          <br />
          [Country]
        </p>
      </section>

      <section>
        <h2>Represented by</h2>
        <p>[Name of Managing Director / Authorized Representative]</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Phone: [Phone Number]
          <br />
          Email: [Your Email Address]
        </p>
      </section>

      <section>
        <h2>Commercial register</h2>
        <p>
          Registration court: [Registration Court]
          <br />
          Registration number: [Registration Number]
        </p>
      </section>

      <section>
        <h2>VAT identification number</h2>
        <p>VAT ID according to §27a of the German VAT act (UStG): [VAT ID Number]</p>
      </section>

      <section>
        <h2>Responsible for content</h2>
        <p>
          Responsible for content according to § 18 Abs. 2 MStV: [Name], [Address as above]
        </p>
      </section>

      <section>
        <h2>Dispute resolution</h2>
        <p>
          The European Commission provides a platform for online dispute resolution (OS):{" "}
          <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noreferrer">
            https://ec.europa.eu/consumers/odr/
          </a>
          . We are not obliged and not willing to participate in dispute resolution proceedings
          before a consumer arbitration board.
        </p>
      </section>

      <section>
        <h2>Liability for content</h2>
        <p>
          As a service provider, we are responsible for our own content on these pages under
          general law. However, we are not obliged to monitor transmitted or stored third-party
          information, or to investigate circumstances that indicate illegal activity. Obligations
          to remove or block the use of information under general law remain unaffected. Liability
          in this regard is only possible from the point in time at which a specific infringement
          becomes known. Upon becoming aware of corresponding infringements, we will remove this
          content immediately.
        </p>
      </section>

      <section>
        <h2>Liability for links</h2>
        <p>
          Our app may contain links to external third-party websites over whose content we have no
          influence. Therefore, we cannot accept any liability for this third-party content. The
          respective provider or operator of the linked pages is always responsible for their
          content. At the time of linking, no legal violations were apparent. A permanent content
          check of linked pages is not reasonable without concrete evidence of an infringement.
          Upon becoming aware of legal violations, we will remove such links immediately.
        </p>
      </section>

      <section>
        <h2>Copyright</h2>
        <p>
          The content and works created by the operator on these pages are subject to German
          copyright law. Duplication, processing, distribution, and any form of use outside the
          limits of copyright law require the written consent of the respective author or creator.
        </p>
      </section>
    </div>
  );
}
