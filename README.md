# Wedding Plan Academy

Online leeromgeving van Estasi Weddings voor toekomstige weddingplanners. Gebouwd op basis van het functioneel bouwplan (versie 1.0, 25 oktober 2026). Dit is de **fase 1** basis: cursus volgen, vragen direct op de lespagina beantwoorden, voortgang en moduleontgrendeling, beheer van inhoud, toegang, feedback en certificaat.

> Deze app bevat ook **Your Wedding Space**, het portaal per bruidspaar (zie verderop). Sabine beheert beide vanuit hetzelfde beheer.

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
* Overzicht cursisten met pakket, aankoopdatum, toegang, voortgang, status, openstaande feedback en laatste activiteit; bij verlopen toegang meteen verlengen vanuit het overzicht
* Cursist toevoegen (handmatige activatie, zie hieronder) met activatielink
* Per cursist: gegevens en aankoopdatum aanpassen; toegang pauzeren, hervatten (einddatum schuift mee), verlengen, einddatum zetten, intrekken; alle antwoorden per les; feedback met bijlage; online afronding bevestigen; certificaat vrijgeven; praktijkstatus en upgrade A naar B; interne notities; wijzigingslog
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
src/lib/data/supabase-store.ts  Opslag in Supabase (database + Storage)
supabase/migrations/         Databaseschema met row level security voor Supabase
```

Alle schrijfacties lopen via server actions die eerst de rol controleren; bestanden gaan via `/api/bestanden/[id]` met een toegangscontrole (een cursist kan nooit bestanden van een andere cursist openen).

## Supabase (productie)

Met `DATA_BACKEND=supabase` gebruikt de app Supabase voor alles: database, bestanden (privé bucket `academy`), inloggen, uitnodigingen, wachtwoordherstel per e-mail en optionele tweestapsverificatie.

Hoe het in elkaar zit:
* Alle gegevens lopen via de server met de secret key (`src/lib/data/supabase-store.ts`). De server actions controleren eerst de rol. De tabellen zijn dicht voor de publieke API; row level security staat aan als extra slot
* Inloggen via Supabase Auth (`src/lib/auth/session.ts` en `supabase-auth.ts`). Sessies staan in cookies en worden ververst door `src/middleware.ts`
* Uitnodiging en herstel: Supabase mailt een link naar `/auth/bevestigen`. De link wordt pas gebruikt als de cursist op Doorgaan drukt, zodat virusscanners in de mail hem niet opmaken. Daarna kiest de cursist een wachtwoord op `/wachtwoord-instellen`
* Tweestapsverificatie is optioneel. De opleider zet hem aan via Instellingen (aanbevolen). Wie een authenticator app heeft gekoppeld, moet bij elke nieuwe login de code geven
* Mislukte inlogpogingen worden per e-mailadres en per IP beperkt (`src/lib/auth/rate-limit.ts`)

### Eenmalig instellen

1. **Migraties**: gaan vanzelf bij elke deploy (zie Deployen). Handmatig kan ook: `npm run db:migrate` met `DATABASE_URL` gezet, of de bestanden uit `supabase/migrations` op volgorde in de SQL editor plakken.
2. **Authentication, Sign In / Providers**: e-mail aan, **Allow new users to sign up uit** (alleen uitnodigen). Minimale wachtwoordlengte 10. Email OTP Expiration op 86400 (24 uur), zodat een uitnodiging een dag geldig is.
3. **Authentication, URL Configuration**: Site URL = de `APP_URL`, en bij Redirect URLs `APP_URL/**`.
4. **Authentication, SMTP**: eigen SMTP instellen (bijvoorbeeld Resend, afzender op het domein van Estasi). De ingebouwde mailer van Supabase mailt alleen naar teamleden en maar een paar keer per uur.
5. **Authentication, Email Templates**: zet in de templates de link zo:
   * Invite user: `{{ .SiteURL }}/auth/bevestigen?token_hash={{ .TokenHash }}&type=invite`
   * Reset password: `{{ .SiteURL }}/auth/bevestigen?token_hash={{ .TokenHash }}&type=recovery`
6. **Authentication, Multi-Factor**: TOTP aan (standaard aan), zodat de opleider hem kan gebruiken.
7. **Authentication, Rate Limits**: alle inlogpogingen komen van het IP van de server. Zet de limiet voor sign-ins ruim (bijvoorbeeld 300 per 5 minuten); de app beperkt zelf al per e-mailadres en per bezoeker.
8. **Eigenaar en instellingen**: met de variabelen uit `.env.example` in `.env.local`:
   ```bash
   npm run supabase:setup -- --eigenaar sabine@estasiweddings.nl --naam "Sabine"
   ```
   Dit controleert de migraties, vult de instellingen, maakt het opleidersaccount en mailt de uitnodiging. Met `--voorbeeldinhoud` laadt het ook de zes voorbeeldmodules (alleen als er nog geen modules zijn). Opnieuw draaien is veilig.

Raakt de opleider de authenticator app kwijt: in Supabase onder Authentication, Users, het account openen en de MFA factor verwijderen. Daarna logt ze weer in met alleen haar wachtwoord en kan ze via Instellingen een nieuwe app koppelen.

## Deployen (Render of Railway)

Er staat een `Dockerfile` (werkt op beide) en een `render.yaml` blueprint. Zet in de hosting:

| Variabele | Waarde |
| --- | --- |
| `DATA_BACKEND` | `supabase` |
| `APP_URL` | het publieke adres, bijvoorbeeld `https://academy.estasiweddings.nl` (zonder `/` aan het eind) |
| `CONTACT_EMAIL` | `academy@estasiweddings.nl` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | publishable key (`sb_publishable_...`) of de oude anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key (`sb_secret_...`) of de oude service_role key, geheim |
| `DATABASE_URL` | migraties én Your Wedding Space: in Supabase de knop **Connect**, dan **Session pooler** (poort 5432, niet de transaction pooler), met het databasewachtwoord ingevuld. Geheim |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | e-mail van Your Wedding Space (uitnodigingen, vragen, RSVP). Kan dezelfde SMTP zijn als in Supabase Auth |
| `ADMIN_NOTIFY_EMAIL` | waar meldingen voor Sabine heen gaan |
| `ANTHROPIC_API_KEY` | optioneel: AI-samenvattingen en concept-stylingplan |

En in Render bij Settings (met de blueprint staat dit er al in):
* **Auto-Deploy**: *On Commit*, dan gaat elke push naar `main` live
* **Pre-Deploy Command**: `node scripts/migrate.mjs`

Het migratiescript voert alleen de nieuwe bestanden uit `supabase/migrations` uit, op volgorde. Wat al gedaan is staat in de tabel `public.schema_migrations`; migraties die eerder met de hand zijn uitgevoerd worden herkend. Elke migratie loopt in één transactie: mislukt hij, dan wordt alles teruggedraaid, stopt de deploy en blijft de vorige versie draaien. Een nieuwe migratie is dus gewoon een nieuw bestand, bijvoorbeeld `0003_iets.sql`.

Er is geen schijf en geen `SESSION_SECRET` nodig. Wil je een demo draaien met `DATA_BACKEND=local`, dan is `SESSION_SECRET` (minimaal 32 tekens) verplicht en heb je een persistente schijf nodig met `DATA_DIR` erop.

## Your Wedding Space (portaal per bruidspaar)

De opvolger van Sabine's Notion-template, op basis van haar document *Reverse engineering: Your Wedding Space* en de schets. Het zit in deze app: één login, één beheer, dezelfde database (eigen schema `wedding_space`, zodat tabellen nooit botsen met de Academy).

**Sabine (beheer, onder "Your Wedding Space" in het menu)**
* Bruidsparen: aanmaken als concept (gegevens, trouwdatum, pakket, aantal meetings). Het portaal staat meteen klaar met starttaken, meetings, draaiboek-tabbladen en opdrachten, maar het bruidspaar ziet niets totdat Sabine na de betaling op "Maak beschikbaar en deel" klikt. Elke partner krijgt dan een Academy-account met de rol `couple` en een uitnodiging
* Mijn takenbord (alle taken in de kolom "Sabine") en Mijn agenda (afspraken en deadlines van alle bruidsparen)
* Pakketten met prijs, richtaantal meetings en starttaken; standaardopdrachten; leverancierscategorieën, contactblok, teksten en haar pasfoto

**Het portaal (`/k/...`, eigen huisstijl: Playfair Display, goud `#A89650`, bordeaux `#6B1E2E`)**
* Hoofdpagina: cover met countdown, welkom, tegels, takenbord (Bruidspaar, Sabine, Bruid, Bruidegom) met geschiedenis, vragenblok (antwoord per mail) met geschiedenis, contactkaart met pasfoto
* Jullie Pakket: meetings met samenvatting (tekst of bestand), Detailbespreking, optioneel Evaluatie
* Draaiboek: tabbladen (Dagplanning met Tijd, Wie, Wat, Meer info, Waar, Waar bij regen; plus lijsten), verwachte gasten bovenaan, tabblad Leveranciers vult zich vanuit Jullie leveranciers, compacte printversie
* Jullie leveranciers: alle categorieën, status, contact, notities en documenten
* Afspraken & deadlines, Kostenoverzicht
* Gastenlijst & RSVP: per groep een formulier met eigen link en QR-code (kleur en achtergrond instelbaar, download als png of svg), vragenlijst per bruiloft aan te passen (deel van de dag, dieet, dresscode, eigen vragen), bevestigings- of afmeldmail met eigen tekst, melding aan Sabine en het bruidspaar. Ieder persoon een eigen regel in de gastenlijst; wie samen aanmeldt blijft gekoppeld
* Opdrachten: vragen met notitievelden, tussentijds opslaan, insturen; zichtbaar vanaf een datum; AI-samenvatting na insturen (Sabine kan hem aanpassen)
* Stylingplan & Moodboard: AI-concept uit de opdracht Thema & Moodboard, door Sabine verfijnd met kleurenpalet en pas zichtbaar na publiceren; moodboard-afbeeldingen

**Nog niet**: offertes met digitaal ondertekenen, Sabine's aanraders (fotokaarten per categorie), de dagelijkse e-mailsamenvatting van activiteit (de activiteit wordt al vastgelegd).

**Beveiliging**: elke pagina, actie en elk bestand van een bruidspaar loopt via `requireCouple` (`src/lib/ws/access.ts`): een bruidspaar ziet alleen het eigen, gedeelde portaal. Bestanden staan in de database (max. 10 MB). RSVP-formulieren zijn openbaar via een moeilijk te raden link, met een limiet per IP en een honeypot. De tabellen hebben row level security aan en geen rechten voor de publieke Supabase API.

**AI**: met `ANTHROPIC_API_KEY` worden opdrachten samengevat en kan Sabine een concept-stylingplan laten maken (model Claude Opus 5.5; een samenvatting kost een paar cent). Zonder sleutel schrijft Sabine die zelf.

**Lokaal**: Your Wedding Space heeft een Postgres-database nodig. Zet `DATABASE_URL` naar een lokale database, draai `node scripts/migrate.mjs` en start de app. Op een lege lokale database heeft migratie 0001 de Supabase-schema's `auth` en `storage` nodig; voor alleen Wedding Space kun je die als lege stubs aanmaken (zie de testopzet in de commitgeschiedenis) of tegen een Supabase-branch werken.

## Voorstel fase 1: betalen en toegang

Totdat de betaalprovider gekozen is: betaling buiten het platform (factuur of betaallink), daarna maakt de opleider de cursist aan via **Cursist toevoegen** en stuurt de activatielink. De code is daarop voorbereid: de stap "account + inschrijving aanmaken" (`createStudent` in `src/app/actions/admin.ts`) kan later één op één worden aangeroepen vanuit een betaal-webhook (bijvoorbeeld Mollie) voor automatische activatie.

## Nog open (uit het bouwplan)

* E-mails voor certificaat en vervalmelding (30 dagen vooraf). Uitnodiging en wachtwoordherstel lopen via Supabase; lokaal komt de herstellink in de serverlog en toont het beheer de activatielink
* Fase 2: community, privéchat, pushmeldingen
* Huisstijl: kleuren nu volgens het bouwplan (wit, goud `#A4914A`, bordeaux `#722F37`) met Cormorant Garamond en Inter, centraal in `src/app/globals.css`. Goud is voor tekst verdonkerd naar `#6F6230` vanwege leesbaarheid
* Videoplatform (advies: Vimeo met domeinbeperking), back-ups, bewaartermijnen en privacyverklaring
