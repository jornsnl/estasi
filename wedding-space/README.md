# Your Wedding Space

Het portaal per bruidspaar van Estasi Weddings: de opvolger van de Notion-template "Your Wedding Space". Gebouwd op basis van Sabine's document *Reverse engineering: Your Wedding Space* (5 november 2026) en de bijbehorende schets. Dit is **fase 1**.

Het is een eigen app, los van de Academy (besluit in h9.7): eigen database, eigen accounts, eigen Render service. Hij staat alleen in dezelfde repository.

## Wat er werkt (fase 1)

**Bruidspaar**
* Hoofdpagina volgens de schets: coverfoto met namen en countdown, welkomsttekst, tegels "Jullie overzicht", takenlijst als bord (Bruidspaar, Sabine, Bruid, Bruidegom) met Geschiedenis, Vragenblok met Geschiedenis, contactblok met contactkaart
* Jullie Pakket: de meetings van dit bruidspaar met richtlijn, status, datum en samenvatting (tekst of bestand), plus Detailbespreking en optioneel Evaluatie
* Jullie leveranciers: alle categorieën altijd zichtbaar, per categorie status, contactgegevens, notities en documenten. Het bruidspaar kan notities en documenten toevoegen, Sabine vult de leverancier zelf in
* Afspraken & deadlines: beide kunnen toevoegen
* Kostenoverzicht: begroot, werkelijk, aanbetaling, vervaldata, betaald, met totalen

**Sabine (beheer)**
* Nieuw bruidspaar: gegevens, trouwdatum, pakket en aantal meetings (standaard van het pakket, aan te passen). Het portaal staat meteen klaar met de starttaken en meetings, maar is een **concept** dat het bruidspaar nog niet ziet
* "Maak beschikbaar en deel": elke partner met een e-mailadres krijgt een persoonlijke uitnodiging. Archiveren of weer verbergen sluit het bruidspaar direct buiten
* Mijn takenbord: alle taken in de kolom "Sabine" van alle bruidsparen op één bord
* Mijn agenda: afspraken met Sabine en alle deadlines, over alle bruidsparen heen
* Pakketten: naam, toevoeging (bijv. De Breedenborg), prijs, richtaantal meetings, leveranciers aan/uit, omschrijving en starttaken per kolom
* Instellingen: contactblok, standaard welkomsttekst, richtlijn per meeting, leverancierscategorieën
* Vragen beantwoorden; het bruidspaar krijgt het antwoord per mail

**E-mail**: uitnodiging, wachtwoord vergeten, nieuwe vraag (naar Sabine) en antwoord (naar het bruidspaar). Zonder SMTP komen mails in de serverlog en toont het beheer de uitnodigingslink om zelf door te sturen.

## Nog niet (volgende fasen)

* Fase 2: Gastenlijst & RSVP (formulieren per groep, QR-codes, bevestigingsmails), Draaiboek (tabbladen, regenlocatie, printversie)
* Fase 3: Opdrachten met AI-samenvatting en concept-stylingplan, Sabine's aanraders, offertes met digitaal ondertekenen
* E-mail bij elke wijziging en bij inloggen: de activiteit wordt al vastgelegd (tabel `activity`); de dagelijkse samenvatting volgt
* Pasfoto van Sabine in de contactkaart

## Beveiliging

* Eén database; elke rij van een bruidspaar heeft `couple_id`. Alle pagina's en acties lopen via `requireCouple` (`src/lib/auth/access.ts`): een bruidspaar krijgt alleen het eigen portaal, het id van een ander portaal geeft "bestaat niet". Bestanden idem (`/api/bestanden/[id]`)
* Sessies staan in de database (alleen een hash van het token), zijn 30 dagen geldig en direct in te trekken. Een nieuw wachtwoord logt alle andere apparaten uit
* Uitnodigings- en herstellinks: alleen de hash staat opgeslagen, eenmalig te gebruiken, 14 dagen (uitnodiging) of 24 uur (herstel) geldig. Een link bekijken gebruikt hem niet op (mailscanners)
* Wachtwoorden met scrypt; limiet op mislukte inlogpogingen per e-mailadres en per IP
* Op Supabase: row level security aan zonder policies en geen rechten voor `anon`/`authenticated`, dus de publieke Supabase API kan er niet bij. De app verbindt rechtstreeks met Postgres

## Lokaal draaien

Nodig: Node 20+ en een Postgres-database.

```bash
cd wedding-space
npm install
```

```bash
export DATABASE_URL=postgresql://postgres@localhost:5432/wedding_space
```

```bash
npm run db:migrate && npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3001. Demo-accounts (wachtwoord `wedding-demo`): `sabine@estasiweddings.nl` (beheer), `carlijn@voorbeeld.nl` en `thom@voorbeeld.nl` (bruidspaar). De seed weigert iets anders dan een lokale database.

Overig: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Live zetten (Render + Supabase)

1. **Supabase**: maak een nieuw project aan (regio EU, bijv. Frankfurt), los van eventuele andere projecten. Kopieer bij **Connect** de connection string van de **Session pooler** en vul het databasewachtwoord in.
2. **Render**: een nieuwe Web Service op deze repository met **Root Directory** `wedding-space`, runtime Docker. Of via de blueprint `render.yaml` (service `your-wedding-space`). Instellen:
   * **Pre-Deploy Command**: `node scripts/migrate.mjs` (voert de migraties uit vóór elke deploy)
   * **Auto-Deploy**: On Commit
   * Variabelen:

| Variabele | Waarde |
| --- | --- |
| `DATABASE_URL` | de Session pooler connection string uit stap 1 |
| `APP_URL` | het publieke adres, bijv. `https://space.estasiweddings.nl` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | de mailserver (bijv. Resend: `smtp.resend.com`, 465, `resend`, API key) |
| `MAIL_FROM` | `Sabine van Estasi Weddings <sabine@estasiweddings.nl>` (domein moet geverifieerd zijn bij de mailprovider) |
| `ADMIN_NOTIFY_EMAIL` | waar meldingen voor Sabine heen gaan |

3. **Beheeraccount voor Sabine** (één keer, na de eerste deploy; vanaf je eigen computer met dezelfde `DATABASE_URL`):

```bash
npm run admin -- --email sabine@estasiweddings.nl --naam "Sabine Tillema"
```

   Dat geeft een link waarmee Sabine haar wachtwoord kiest (7 dagen geldig). Zet `APP_URL` daarbij op het publieke adres.

4. **Domein**: koppel in Render het (sub)domein en zet bij de DNS-beheerder het CNAME-record dat Render opgeeft.

Bestanden (coverfoto's, verslagen, offertes) staan in de database, maximaal 10 MB per bestand. Dat is eenvoudig en wordt met de database mee geback-upt; bij veel grote bestanden kunnen we later naar Supabase Storage.

## Opbouw

```
db/migrations/           SQL-schema (genummerd; scripts/migrate.mjs voert nieuwe uit)
scripts/                 migrate, seed (alleen lokaal), create-admin
src/lib/auth/            sessies, wachtwoorden, inloglimiet, toegang per bruidspaar
src/lib/data/            queries per onderdeel
src/lib/domain/          pure regels (countdown, bedragen, kostentotalen) met tests
src/app/k/[coupleId]/    het portaal (bruidspaar én Sabine)
src/app/beheer/          beheer voor Sabine
src/app/actions/         alle schrijfacties (server actions, met toegangscontrole)
```
