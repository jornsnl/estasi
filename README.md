# Wedding Plan Academy

Online leeromgeving van Estasi Weddings voor toekomstige weddingplanners. Gebouwd op basis van het functioneel bouwplan (versie 1.0, 25 oktober 2026). Dit is de **fase 1** basis: cursus volgen, vragen direct op de lespagina beantwoorden, voortgang en moduleontgrendeling, beheer van inhoud, toegang, feedback en certificaat.

## Lokaal draaien (zonder database)

```bash
npm install
npm run dev
```

Open http://localhost:3000. Alle gegevens worden bewaard in `.data/db.json` en uploads in `.data/uploads/`. Er is geen database nodig, en wat je in het portaal doet blijft bewaard na een herstart. Bij de eerste start wordt demodata aangemaakt.

| Account | Rol |
| --- | --- |
| `sabine@estasiweddings.nl` | Opleider / eigenaar |
| `lotte@voorbeeld.nl` | Cursist, halverwege module 2 |
| `noor@voorbeeld.nl` | Cursist pakket B, 100%, wacht op bevestiging |
| `eva@voorbeeld.nl` | Cursist met verlopen toegang |

Wachtwoord voor alle demo-accounts: `academy-demo`.

Opnieuw beginnen met verse demodata: `npm run reset-data` en daarna de app herstarten.

Overige commando's: `npm test` (regels voor toegang, voortgang en feedback), `npm run typecheck`, `npm run lint`, `npm run build`.

## Wat er werkt

**Cursist**
* Inloggen, account activeren via link, wachtwoord vergeten
* Dashboard met welkomstvideo, huidige module, "Ga verder", voortgangsbalk, modulekaarten en resterende toegang
* Mijn opleiding: modules met status vergrendeld / beschikbaar / afgerond en afgeronde lessen per module
* Lespagina: video, tekst, downloads en vragen (open, reflectie, praktijk, meerkeuze, bestand inleveren) direct op de pagina. Tussentijds opslaan, later aanpassen, ook na afronding. Waarschuwing bij niet opgeslagen wijzigingen
* Les afronden kan pas als alle verplichte vragen beantwoord zijn; de volgende module gaat open als de vorige helemaal af is
* Feedback van de opleider bij de opdracht, met melding als het antwoord daarna is aangepast
* Profiel met foto, woonplaats, bedrijfsnaam, socials, introductie en doelen
* Certificaat pas zichtbaar na vrijgave door de opleider, te bewaren als pdf
* Verlopen, gepauzeerde of ingetrokken toegang: account blijft bestaan, lessen zijn dicht, contactadres blijft zichtbaar

**Opleider (`/beheer`)**
* Overzicht cursisten met pakket, aankoopdatum, toegang, voortgang, status, openstaande feedback en laatste activiteit
* Cursist toevoegen (handmatige activatie, zie hieronder) met activatielink
* Per cursist: toegang pauzeren, hervatten (einddatum schuift mee), verlengen, einddatum zetten, intrekken; alle antwoorden per les; feedback met bijlage; online afronding bevestigen; certificaat vrijgeven; praktijkstatus en upgrade A naar B; interne notities; wijzigingslog
* Lesinhoud: modules en lessen toevoegen, bewerken, verwijderen en herschikken; per les blokken toevoegen, bewerken, verplicht/optioneel en "feedbackopdracht" markeren en herschikken. Geen Word of pdf nodig voor vragen
* Instellingen: welkomstvideo en tekst, contactadres, praktijkplekken open/dicht, privacyuitleg boven de opdrachten
* Logboek van alle beheeracties

## Opbouw

```
src/lib/data/types.ts        Domeinmodel (gedeeld door alle opslag)
src/lib/data/store.ts        Interface DataStore + FileStorage
src/lib/data/local-store.ts  Lokale opslag in .data/ (JSON + uploads)
src/lib/data/seed.ts         Demodata
src/lib/domain/              Pure regels: toegang/pauze, voortgang, feedbackstatus
src/lib/auth/                Wachtwoorden (scrypt) en ondertekende sessiecookie
src/app/(student)/           Cursistschermen
src/app/beheer/              Beheeromgeving
src/app/actions/             Server actions (alle schrijfacties, met rolcontrole)
supabase/migrations/         Databaseschema met row level security voor Supabase
```

Alle schrijfacties lopen via server actions die eerst de rol controleren; bestanden gaan via `/api/bestanden/[id]` met een toegangscontrole (een cursist kan nooit bestanden van een andere cursist openen).

## Naar Supabase

De app praat alleen met de interface `DataStore` (`src/lib/data/store.ts`). Overstappen betekent:

1. Supabase project aanmaken (regio EU) en `supabase/migrations/0001_init.sql` uitvoeren. Het schema bevat al row level security: een cursist kan alleen eigen antwoorden lezen en schrijven, en alleen bij actieve toegang.
2. Een `SupabaseDataStore` en `SupabaseFileStorage` (privé bucket `academy`) schrijven die dezelfde interface implementeren, en in `src/lib/data/index.ts` kiezen op `DATA_BACKEND=supabase`.
3. Inloggen omzetten naar Supabase Auth (`src/lib/auth/session.ts`); daarmee komen ook wachtwoordherstel per e-mail en MFA voor de beheerder.
4. Demodata of echte inhoud importeren.

## Deployen (Render of Railway)

Er staat een `Dockerfile` (werkt op beide) en een `render.yaml` blueprint. Benodigde variabelen staan in `.env.example`; in productie is `SESSION_SECRET` (minimaal 32 tekens) verplicht.

Zolang `DATA_BACKEND=local` draait, staan de gegevens op schijf. Koppel dan een persistente schijf (Render: zit in `render.yaml`; Railway: voeg een volume toe op `/var/data` en zet `DATA_DIR=/var/data`). Voor echte cursistgegevens is Supabase de bedoeling.

## Voorstel fase 1: betalen en toegang

Totdat de betaalprovider gekozen is: betaling buiten het platform (factuur of betaallink), daarna maakt de opleider de cursist aan via **Cursist toevoegen** en stuurt de activatielink. De code is daarop voorbereid: de stap "account + inschrijving aanmaken" (`createStudent` in `src/app/actions/admin.ts`) kan later één op één worden aangeroepen vanuit een betaal-webhook (bijvoorbeeld Mollie) voor automatische activatie.

## Nog open (uit het bouwplan)

* Echte e-mails (activatie, wachtwoordherstel, certificaat, vervalmelding 30 dagen vooraf). Lokaal komt de herstellink in de serverlog en toont het beheer de activatielink
* Fase 2: community, privéchat, pushmeldingen
* Huisstijl: kleuren nu volgens het bouwplan (wit, goud `#A4914A`, bordeaux `#722F37`) met Cormorant Garamond en Inter, centraal in `src/app/globals.css`. Goud is voor tekst verdonkerd naar `#6F6230` vanwege leesbaarheid
* Videoplatform (advies: Vimeo met domeinbeperking), back-ups, bewaartermijnen en privacyverklaring
