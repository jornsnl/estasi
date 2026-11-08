import Link from "next/link";

/**
 * Academy 16: what the Academy keeps about a student, who sees it and what
 * the student can do. Based on what the app really stores (see
 * src/lib/domain/inzage.ts, INZAGE_SECTIONS). Text to be checked by Sabine.
 */
export function PrivacyNotice({ contactEmail }: { contactEmail: string }) {
  return (
    <section id="privacy" className="card space-y-3 p-6 text-sm">
      <h2 className="text-2xl">Privacy: wat we van je bewaren</h2>
      <p>De Wedding Plan Academy bewaart alleen wat nodig is om je de opleiding te laten volgen:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Account en profiel:</strong> je naam, e-mailadres, telefoon, woonplaats, bedrijfsnaam, profielfoto, socials, introductie en doelen. Je wachtwoord bewaren we niet leesbaar.</li>
        <li><strong>Inschrijving:</strong> je pakket, aankoopdatum, einddatum van je toegang, eventuele pauzes, je afronding en certificaat, en notities die Sabine voor zichzelf maakt.</li>
        <li><strong>Opdrachten:</strong> je concepten, elke ingediende versie (met de vragen zoals ze toen waren), je geüploade bestanden en de feedback van Sabine.</li>
        <li><strong>Community en privéberichten:</strong> wat je plaatst en de bijlagen. Je privégesprek is alleen zichtbaar voor jou en Sabine.</li>
        <li><strong>Meldingen:</strong> je keuze voor mail en pushmeldingen, een kopie van de mails die de Academy je stuurt en de apparaten waarop pushmeldingen aan staan.</li>
        <li><strong>Meelopen bij een bruiloft:</strong> wanneer je het draaiboek van een bruidspaar hebt geopend.</li>
        <li><strong>Logboek:</strong> wat Sabine in het beheer aan je account wijzigt, en wanneer je voor het laatst actief was.</li>
      </ul>
      <p>
        <strong>Wie ziet wat?</strong> Je opdrachten, je portfolio, je feedback en je profiel zie alleen jij en Sabine. Andere cursisten zien in de
        community alleen je naam en wat je daar zelf plaatst.
      </p>
      <p>
        <strong>Bewaren, downloaden en verwijderen.</strong> Je ingeleverde opdrachten blijven bewaard, ook als een les later wordt aangepast. Je kunt je
        volledige portfolio altijd zelf downloaden via <Link href="/portfolio" className="text-bordeaux underline">Mijn portfolio</Link>. Wil je weten
        welke gegevens we precies van je hebben, of wil je dat je account met alle gegevens en bestanden definitief wordt verwijderd? Mail dan
        {contactEmail ? (
          <>
            {" "}
            <a href={`mailto:${contactEmail}`} className="text-bordeaux underline">{contactEmail}</a>
          </>
        ) : (
          " Sabine"
        )}
        . Na verwijderen is niets meer terug te halen.
      </p>
    </section>
  );
}
