# Wedding Plan Academy

Online leeromgeving van Estasi Weddings voor toekomstige weddingplanners. Gebouwd op basis van het functioneel bouwplan (versie 1.0, 25 oktober 2026). Dit is de **fase 1** basis: cursus volgen, vragen direct op de lespagina beantwoorden, voortgang en moduleontgrendeling, beheer van inhoud, toegang, feedback en certificaat.

> Deze app bevat ook **Your Wedding Space**, het portaal per bruidspaar (zie verderop). Sabine beheert beide vanuit hetzelfde beheer.

## Lokaal draaien (Postgres)

De app bewaart alles in Postgres (`DATABASE_URL`), lokaal net als in productie. Nodig: Node 20+ en een Postgres (16). Zonder `SUPABASE_URL` gebruikt de app lokaal een eenvoudige **ontwikkel-login** (wachtwoorden in de tabel `public.dev_passwords`) en bewaart ze uploads in de database. In productie (`NODE_ENV=production`) of met `SUPABASE_URL` weigert die ontwikkel-login altijd.

```bash
npm install
createdb estasi
psql estasi -f scripts/local-supabase-stub.sql   # alleen bij een kale Postgres: de schema's auth en storage van Supabase, minimaal
cp .env.example .env.local                       # zet DATABASE_URL en SESSION_SECRET, laat SUPABASE_URL leeg
npm run db:migrate                               # migraties uit supabase/migrations
npm run db:seed                                  # demo-accounts en de zes voorbeeldmodules
npm run dev
```

Open http://localhost:3000 en log in met een demo-account (alleen ontwikkeling):

| Account | Rol |
| --- | --- |
| `sabine@estasiweddings.nl` | Opleider / eigenaar |
| `lotte@voorbeeld.nl` | Cursist, halverwege module 2 |
| `noor@voorbeeld.nl` | Cursist pakket B, 100%, wacht op bevestiging |
| `eva@voorbeeld.nl` | Cursist met verlopen toegang |

Wachtwoord voor alle demo-accounts: `academy-demo`.

`npm run db:seed` vult alleen aan wat ontbreekt en kan vaker draaien. `npm run db:seed -- --reset` haalt eerst de demo-accounts (met hun antwoorden) en de demomodules weg. Helemaal opnieuw: database weggooien, opnieuw aanmaken, migreren en seeden. Het seedscript weigert met `SUPABASE_URL`, met `NODE_ENV=production` en tegen een database die niet op deze computer staat (tenzij `SEED_ALLOW_REMOTE=1`).

Nieuwe cursisten en bruidsparen krijgen lokaal een activatielink op het scherm (er gaat geen e-mail uit); bij wachtwoord vergeten staat de link in de serverlog.

Overige commando's: `npm test` (regels voor toegang, voortgang en feedback; met `TEST_DATABASE_URL` erbij ook de opslag tegen een gemigreerde database), `npm run typecheck`, `npm run lint`, `npm run build`.

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

## Community en privéberichten (Academy)

Eén gezamenlijke community voor alle cursisten met actieve toegang en Sabine, plus een privégesprek tussen Sabine en elke cursist afzonderlijk. Cursist: **Community** (`/community`) en **Privéchat** (`/prive-chat`). Beheer: **Community** (`/beheer/community`) en **Privéberichten** (`/beheer/berichten`). Het menu toont het aantal ongelezen berichten (bij Sabine telt de community ook open meldingen mee).

**Wat kan er**
* Berichten met tekst, foto's, korte eigen video's, bestanden en een video van YouTube of Vimeo (ingesloten speler). Reacties op berichten, ook met bijlage
* De schrijver kan het eigen bericht of de eigen reactie bewerken en verwijderen; een cursist kan een bericht of reactie van een ander **melden** bij Sabine (met reden). Sabine krijgt een melding meteen per mail (en push)
* Sabine kan berichten vastpinnen (bovenaan), berichten en reacties verbergen (alleen zij en de schrijver zien ze dan nog, met een label) of verwijderen. Verbergen handelt de melding ook af. Verwijderen en verbergen van andermans berichten komt in het logboek
* Privéberichten: één gesprek per cursist, alleen die cursist en Sabine zien het (ook de bijlagen). Sabine begint een gesprek via Privéberichten, Nieuw gesprek. Het gesprek ververst elke 30 seconden vanzelf
* Tekst wordt nooit als HTML getoond: platte tekst, alleen http(s)-links worden klikbaar (`src/lib/community/rules.ts`, `linkify`)
* Bruidsparen (rol `couple`) komen er niet in

**Toegang verlopen, gepauzeerd of ingetrokken** (besluit): geen toegang tot de community, ook niet alleen-lezen; de foto's en bestanden daarvan openen dan ook niet. Het privégesprek met Sabine blijft leesbaar en de cursist kan Sabine antwoorden zodra er een gesprek is, maar kan zelf geen nieuw gesprek beginnen. Zonder inschrijving: geen van beide.

**Bijlagen**: gewone Academy-uploads (`public.files`, bucket `academy`), met de bestaande grens van 10 MB per bestand, maximaal 6 per bericht. Foto's worden in de browser eerst verkleind (maximaal 2400 px, JPG, zoals bij Your Wedding Space). Video's worden nooit geüpload, alleen als YouTube- of Vimeo-link ingesloten (eerder geüploade video's blijven zichtbaar). Bestanden: pdf, Word, Excel, PowerPoint, txt. Elk bestand gaat apart naar de server zodra het gekozen is en wordt pas aan een bericht gekoppeld bij plaatsen; nooit geplaatste uploads verdwijnen na een dag. Openen kan alleen via `/api/community/bestanden/[id]`, dat eerst dezelfde regel toepast als het bericht, de reactie of het gesprek; in `public.files` staat de uploader (of de cursist van het gesprek) als eigenaar, zodat de algemene route `/api/bestanden` ze nooit aan anderen geeft.

**E-mail** (via `sendMail` uit `src/lib/ws/mail.ts`, dus Resend of SMTP, en zichtbaar in de mailgeschiedenis als *Academy community* / *Academy privébericht*): gebundeld, hoogstens één mail per uur per persoon over nieuwe berichten en reacties in de community, en hoogstens één per kwartier over privéberichten. De eerste melding na een rustig venster gaat meteen; wat daarna binnen het venster komt, gaat mee in de volgende mail. Alleen over wat iemand nog niet gezien heeft, nooit over eigen berichten, en een privébericht-mail bevat nooit de inhoud. Per persoon aan of uit op het profiel (cursist `/profiel`, Sabine `/beheer/profiel`), standaard aan. Nieuwe accounts krijgen geen mail over wat er al stond.

Omdat er geen cron is, verstuurt de app de gebundelde mails zelf: direct na elk nieuw bericht, reactie of privébericht, en verder bij elke paginaweergave in de Academy of het beheer (hoogstens één keer per minuut per server). Een slot in Postgres voorkomt dubbele mails. Wie het venster precies wil halen zonder dat er iemand op de site is, kan de hosting periodiek (bijvoorbeeld elk kwartier) laten aanroepen:

```bash
curl -H "Authorization: Bearer $COMMUNITY_CRON_SECRET" https://academy.estasiweddings.nl/api/community/meldingen
```

Zonder `COMMUNITY_CRON_SECRET` (minimaal 16 tekens) staat die endpoint uit.

**Pushmeldingen** (Web Push, pakket `web-push`): via de service worker van de app (`public/beheer-sw.js`, dezelfde als die van de beheer-app). Op het profiel zet ieder ze aan per apparaat. Community: hoogstens één push per uur per persoon; privéberichten en meldingen: altijd, zonder inhoud. Sleutels aanmaken (eenmalig) en in de hosting zetten:

```bash
npx web-push generate-vapid-keys
```

`VAPID_PUBLIC_KEY` en `VAPID_PRIVATE_KEY` uit de uitvoer, en `VAPID_SUBJECT` (bijvoorbeeld `mailto:academy@estasiweddings.nl`). Zonder sleutels staat er op het profiel dat pushmeldingen niet zijn ingesteld en gaat alles alleen per mail. Op iPhone en iPad werken pushmeldingen alleen als de Academy (of het beheer) op het beginscherm staat en vanaf daar geopend is (iOS 16.4 of nieuwer); daarvoor hebben cursisten nu ook een manifest (`/academy.webmanifest`). Worden de sleutels vervangen, dan moet iedereen de meldingen opnieuw aanzetten.

Code: `src/lib/community/rules.ts` (wie mag wat, tekst, bundelvensters; getest in `tests/community.test.ts`), `server.ts` (queries), `notify.ts` (mail), `push.ts`, `src/app/actions/community.ts`, `src/components/community/`. Tabellen (migratie `0026`): `community_posts`, `community_comments`, `community_reports`, `private_messages`, `community_attachments`, `community_members` (gezien, mail aan/uit, bundeling) en `push_subscriptions`. Met `TEST_DATABASE_URL` test `tests/community-db.test.ts` de queries en de bundeling tegen een database.

## Portfolio, toegangstermijn en privacy (Academy)

**Portfolio** (`/portfolio` voor de cursist, `/beheer/cursisten/[id]/portfolio` voor Sabine): vult zich vanzelf met elke opdracht waar iets in staat, ook zonder feedbackverzoek, per module en les. Per opdracht alle ingediende versies met de vragen zoals ze toen waren (de kopie in `submission_versions`), antwoorden, bestanden met voorbeeld van afbeeldingen, verstuurde feedback (Sabine ziet ook haar concepten) en een concept dat nog niet (opnieuw) is ingediend. Werk uit lessen die later zijn verwijderd blijft staan onder "Lessen die niet meer bestaan". **Exporteren**: `/api/portfolio` geeft een zip (zonder extra pakket, `src/lib/zip.ts`) met `portfolio.html` (opent in elke browser, af te drukken als pdf) en de map `bestanden`; daarnaast een printknop op de pagina. Een cursist krijgt altijd alleen het eigen portfolio, ook na het einde van de toegang.

**Toegangstermijn**: standaard 12 maanden (bij Cursist toevoegen te kiezen: 3, 6, 12, 18 of 24). Einddatum in het overzicht en per cursist, met "verloopt binnenkort" in de laatste 30 dagen; verlengen en einddatum zetten per cursist (en verlengen vanuit het overzicht bij verlopen toegang). De cursist krijgt een mail 30 en 7 dagen voor het einde (eenmalig per drempel en per einddatum, `public.access_notices`; na verlengen kan het opnieuw) en ziet in de laatste 30 dagen een balk met een knop naar het portfolio. Geen cron: de mails gaan bij paginaweergaven in Academy en beheer (hoogstens eens per uur, met een slot in Postgres, `src/lib/academy-expiry.ts`) of via

```bash
curl -H "Authorization: Bearer $COMMUNITY_CRON_SECRET" https://academy.estasiweddings.nl/api/academy/toegang-meldingen
```

(zelfde geheim als de community; bijvoorbeeld eens per dag).

**Privacy (AVG)**: cursisten zien alleen hun eigen opdrachten, portfolio, feedback en bestanden (`src/lib/domain/privacy.ts`, getest). Per cursist onder Privacy: **Alle gegevens downloaden** (`/api/beheer/inzage/[id]`, zip met `overzicht.html`, `gegevens.json`, `portfolio.html` en alle bestanden; zonder wachtwoorden, sleutels of codes) en **Definitief verwijderen** (vinkje plus het e-mailadres overtypen plus bevestigen). Verwijderen haalt alles weg: account en login (Supabase Auth via de admin-client, lokaal `auth.users`), profiel, inschrijving, opdrachten, versies, feedback, bestanden (Postgres of Supabase Storage), privéberichten, meekijktoegang, pushabonnementen, meldingen, mails in de mailgeschiedenis en logboekregels over de persoon. Community-berichten en reacties van de cursist worden **verwijderd** (niet geanonimiseerd), met de reacties van anderen onder die berichten. In het logboek blijft één regel "Cursist definitief verwijderd" zonder naam of e-mailadres. Onder Mijn profiel staat een korte privacytekst (`src/components/academy/PrivacyNotice.tsx`).

## Opbouw

```
src/lib/db.ts                De Postgres-pool (DATABASE_URL), gedeeld door Academy en Your Wedding Space
src/lib/data/types.ts        Domeinmodel
src/lib/data/store.ts        Interface DataStore + FileStorage
src/lib/data/pg-store.ts     Academy-opslag in Postgres (schema public)
src/lib/data/rows.ts         Omzetting domein <-> tabelrijen (camelCase <-> snake_case)
src/lib/data/files.ts        Uploads: Supabase Storage (bucket academy), lokaal in Postgres
src/lib/data/seed.ts         Demodata (scripts/seed-dev.ts)
src/lib/domain/              Pure regels: toegang/pauze, voortgang, feedbackstatus
src/lib/auth/                Supabase Auth, sessies, passkeys; dev-auth.ts is de ontwikkel-login
src/app/(student)/           Cursistschermen
src/app/beheer/              Beheeromgeving
src/app/actions/             Server actions (alle schrijfacties, met rolcontrole)
supabase/migrations/         Databaseschema met row level security voor Supabase
```

Database: één pool in `src/lib/db.ts` (`query`, `one`, `tx`, `isUuid`). De zoekvolgorde is `wedding_space, public`, dus Academy-queries noemen altijd het schema (`select * from public.lessons ...`; beide schema's hebben een tabel `files`). Bestaande Academy-entiteiten gaan via `getStore()` (`src/lib/data/pg-store.ts`, omzetting in `rows.ts`); nieuwe Academy-tabellen krijgen een migratie in `supabase/migrations` met `enable row level security` en worden met `query`/`tx` uit `@/lib/db` gelezen en geschreven.

Alle schrijfacties lopen via server actions die eerst de rol controleren; bestanden gaan via `/api/bestanden/[id]` met een toegangscontrole (een cursist kan nooit bestanden van een andere cursist openen).

## Supabase (productie)

Met `SUPABASE_URL` gebruikt de app Supabase voor alles: database (via `DATABASE_URL`), bestanden (privé bucket `academy`), inloggen, uitnodigingen, wachtwoordherstel per e-mail en optionele tweestapsverificatie.

Hoe het in elkaar zit:
* Alle gegevens lopen via de server, rechtstreeks met Postgres (`DATABASE_URL`, `src/lib/data/pg-store.ts`). De server actions controleren eerst de rol. De tabellen zijn dicht voor de publieke API; row level security staat aan als extra slot
* Inloggen via Supabase Auth (`src/lib/auth/session.ts` en `supabase-auth.ts`). Sessies staan in cookies en worden ververst door `src/middleware.ts`
* Uitnodiging en herstel: Supabase mailt een link naar `/auth/bevestigen`. De link wordt pas gebruikt als de cursist op Doorgaan drukt, zodat virusscanners in de mail hem niet opmaken. Daarna kiest de cursist een wachtwoord op `/wachtwoord-instellen`
* Tijdelijk wachtwoord (noodoptie): op de cursistpagina kan de opleider onder Gegevens een tijdelijk wachtwoord instellen (via de admin-API van Supabase Auth, die ook het e-mailadres bevestigt). Zij geeft het zelf door. Zolang `public.users.must_change_password` aan staat, stuurt de app de cursist na het inloggen en bij elke Academy-pagina naar `/wachtwoord-instellen`; na een eigen wachtwoord werkt het tijdelijke niet meer. Het wachtwoord komt nooit in het logboek of in een URL (migratie `0032`)
* Tweestapsverificatie is optioneel. De opleider zet hem aan via Instellingen (aanbevolen). Wie een authenticator app heeft gekoppeld, moet bij elke nieuwe login de code geven
* Mislukte inlogpogingen worden per e-mailadres en per IP beperkt (`src/lib/auth/rate-limit.ts`)
* Het beheeraccount kan ook inloggen met een passkey (zie Passkeys en MCP)

### Eenmalig instellen

1. **Migraties**: gaan vanzelf bij elke deploy (zie Deployen). Handmatig kan ook: `npm run db:migrate` met `DATABASE_URL` gezet, of de bestanden uit `supabase/migrations` op volgorde in de SQL editor plakken.
2. **Authentication, Sign In / Providers**: e-mail aan, **Allow new users to sign up uit** (alleen uitnodigen). Minimale wachtwoordlengte 10. Email OTP Expiration op 86400 (24 uur), zodat een uitnodiging een dag geldig is.
3. **Authentication, URL Configuration**: Site URL = de `APP_URL`, en bij Redirect URLs `APP_URL/**`.
4. **Authentication, SMTP**: eigen SMTP instellen, met Resend: host `smtp.resend.com`, poort `465`, gebruiker `resend`, wachtwoord = de Resend API key, afzender een adres op het geverifieerde domein (bijvoorbeeld `academy@estasiweddings.nl`). De ingebouwde mailer van Supabase mailt alleen naar teamleden en maar een paar keer per uur.
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

## Passkeys en MCP (beheeraccount)

Onder **Beheer, Profiel en beveiliging** (`/beheer/profiel`) staan twee dingen voor het opleidersaccount.

### Passkeys

Inloggen zonder wachtwoord, met vingerafdruk, gezicht of de pincode van het apparaat (WebAuthn, via `@simplewebauthn`). Op het inlogscherm staat de knop *Inloggen met passkey*.

* Alleen het beheeraccount kan passkeys toevoegen (maximaal 10). Ze werken alleen op het domein van `APP_URL`: verandert het domein, dan moeten de passkeys opnieuw worden toegevoegd
* Een passkey vraagt altijd om vingerafdruk, gezicht of pincode, dus hij telt als beide stappen: na inloggen met een passkey wordt geen authenticator code meer gevraagd. Inloggen met het wachtwoord blijft gewoon werken, met de code als die is gekoppeld
* Met Supabase controleert de app de passkey zelf en start daarna een gewone Supabase-sessie (een eenmalige inloglink die meteen op de server wordt gebruikt en nooit wordt gemaild). In Supabase hoeft niets te worden ingesteld. Dat de sessie met een passkey is begonnen, staat in een ondertekende cookie die aan die ene sessie vastzit
* Code: `src/lib/auth/passkeys.ts`, `src/app/actions/passkeys.ts`, tabel `passkeys` (migratie `0016`)

### MCP (Model Context Protocol)

Een AI-assistent zoals Claude kan met toestemming van Sabine in de Academy en Your Wedding Space kijken en, als zij dat toestaat, dingen doen. De server staat op `APP_URL/api/mcp` (Streamable HTTP, JSON-antwoorden, zonder sessiestatus).

Inloggen gaat met **OAuth 2.1**; de app is zelf de autorisatieserver:

| Onderdeel | Adres |
| --- | --- |
| Metadata van de resource (RFC 9728) | `/.well-known/oauth-protected-resource` |
| Metadata van de autorisatieserver (RFC 8414) | `/.well-known/oauth-authorization-server` |
| Zelf aanmelden van apps (RFC 7591) | `/api/oauth/register` |
| Toestemmingsscherm | `/oauth/authorize` |
| Tokens (authorization code met PKCE S256, refresh token) | `/api/oauth/token` |
| Token intrekken (RFC 7009) | `/api/oauth/revoke` |

Zo werkt het:
* MCP staat standaard uit. Sabine zet het aan op haar profiel en kiest of apps ook mogen **wijzigen** (scope `write`) of alleen **lezen** (`read`)
* Claude koppelen: in Claude bij Instellingen, Connectors een aangepaste connector toevoegen met de server-URL. Claude meldt zich zelf aan, stuurt Sabine naar het toestemmingsscherm (inloggen met passkey of wachtwoord plus code) en zij kiest Toestaan. Apps die zich niet zelf kunnen aanmelden maakt ze op het profiel aan, met een client ID en secret
* Aanmelden alleen geeft geen toegang; elke verbinding moet op het toestemmingsscherm worden goedgekeurd. Zelf aangemelde apps die nooit zijn goedgekeurd verdwijnen na een dag
* Access tokens zijn een uur geldig, refresh tokens dertig dagen en worden bij elk gebruik vervangen (een oud refresh token werkt niet meer). Tokens, codes en secrets staan alleen als sha256 in de database
* Op het profiel staan de verbonden apps met laatste gebruik; *Verbreken* trekt de toegang direct in. MCP uitzetten blokkeert alle apps meteen
* Wijzigingen via MCP komen in het logboek met de naam van de app

Tools (de lijst met uitleg staat ook op het profiel):
* **Academy, lezen**: overzicht, cursisten (zoeken en filteren op toegang), één cursist met voortgang en notities, openstaande feedback, antwoorden van een cursist, lesinhoud, één les, logboek, instellingen
* **Academy, wijzigen**: feedback geven, interne notities, toegang (verlengen, einddatum, pauzeren, hervatten, intrekken, herstellen), afronding bevestigen, certificaat vrijgeven en praktijkstatus
* **Your Wedding Space, lezen** (als `DATABASE_URL` is ingesteld): bruidsparen, één bruidspaar, takenbord (ook Sabine's eigen bord), vragen, agenda (afspraken, deadlines, meetings en bruiloften), meetings, leveranciers, kosten en budget, RSVP, draaiboek, activiteit, pakketten
* **Your Wedding Space, wijzigen**: taak toevoegen, taak afvinken, vraag beantwoorden (met e-mail aan het bruidspaar), afspraak of deadline toevoegen, meeting bijwerken

Code: `src/lib/oauth/` (autorisatieserver), `src/lib/mcp/` (protocol en tools), `src/app/api/mcp/route.ts`, tabellen `mcp_settings`, `oauth_clients`, `oauth_codes` en `oauth_grants` (migratie `0016`).

## Deployen (Render of Railway)

Er staat een `Dockerfile` (werkt op beide) en een `render.yaml` blueprint. Zet in de hosting:

| Variabele | Waarde |
| --- | --- |
| `APP_URL` | het publieke adres, bijvoorbeeld `https://academy.estasiweddings.nl` (zonder `/` aan het eind) |
| `CONTACT_EMAIL` | `academy@estasiweddings.nl` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | publishable key (`sb_publishable_...`) of de oude anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key (`sb_secret_...`) of de oude service_role key, geheim |
| `DATABASE_URL` | alle gegevens (Academy en Your Wedding Space) en de migraties: in Supabase de knop **Connect**, dan **Session pooler** (poort 5432, niet de transaction pooler), met het databasewachtwoord ingevuld. Geheim |
| `RESEND_API_KEY`, `MAIL_FROM` | e-mail van Your Wedding Space (uitnodigingen, vragen, RSVP) via de API van Resend. `MAIL_FROM` moet op het bij Resend geverifieerde domein staan. Geheim |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | alleen als je geen Resend gebruikt: een andere SMTP-server |
| `ADMIN_NOTIFY_EMAIL` | waar meldingen voor Sabine heen gaan |
| `ANTHROPIC_API_KEY` | optioneel: AI-samenvattingen en concept-stylingplan |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optioneel: pushmeldingen van de community (`npx web-push generate-vapid-keys`). Privésleutel geheim |
| `COMMUNITY_CRON_SECRET` | optioneel: geheim voor `/api/community/meldingen` (gebundelde mails op tijd versturen) |

En in Render bij Settings (met de blueprint staat dit er al in):
* **Auto-Deploy**: *On Commit*, dan gaat elke push naar `main` live
* **Pre-Deploy Command**: `node scripts/migrate.mjs`

Het migratiescript voert alleen de nieuwe bestanden uit `supabase/migrations` uit, op volgorde. Wat al gedaan is staat in de tabel `public.schema_migrations`; migraties die eerder met de hand zijn uitgevoerd worden herkend. Elke migratie loopt in één transactie: mislukt hij, dan wordt alles teruggedraaid, stopt de deploy en blijft de vorige versie draaien. Een nieuwe migratie is dus gewoon een nieuw bestand, bijvoorbeeld `0003_iets.sql`.

### E-mail via Resend

Alle e-mail loopt via Resend: die van Your Wedding Space via de API (`RESEND_API_KEY`), die van inloggen en wachtwoorden (Supabase Auth) via de SMTP van Resend.

1. Account op resend.com; onder **Domains** het domein `estasiweddings.nl` toevoegen en de DNS-records (SPF, DKIM en eventueel DMARC) bij de domeinbeheerder zetten. Wacht tot Resend het domein als *Verified* toont.
2. Onder **API Keys** een key maken met *Sending access* voor dat domein.
3. In Render: `RESEND_API_KEY` = de key, `MAIL_FROM` = bijvoorbeeld `Sabine van Estasi Weddings <sabine@estasiweddings.nl>`. `SMTP_*` leeg laten.
4. In Supabase, Authentication, SMTP: host `smtp.resend.com`, poort `465`, gebruiker `resend`, wachtwoord = dezelfde key.
5. Test: deel een portaal met een eigen e-mailadres of vul een RSVP in. Lukt het niet, dan staat de reden van Resend in de mailgeschiedenis (Beheer, Mailgeschiedenis) en in de log van Render (`[mail] versturen mislukt`).

Elke mail van Your Wedding Space gaat via `sendMail` in `src/lib/ws/mail.ts` en komt in de tabel `mail_log` (type, ontvanger, gast, onderwerp, status en foutreden). Mails met een inloglink worden zonder tekst bewaard en niet opnieuw verstuurd. Mails die Sabine aan gasten stuurt gaan één voor één (met een korte pauze, Resend staat ongeveer twee per seconde toe), met reply-to het contactadres uit Instellingen portaal.

DNS voor `estasiweddings.nl` (de precieze waarden staan bij Resend onder Domains): een TXT-record `resend._domainkey` (DKIM); op het subdomein `send` een MX-record naar Resends feedback-server en een TXT-record `v=spf1 include:amazonses.com ~all` (SPF voor de bounce-afhandeling); en een TXT-record `_dmarc` met bijvoorbeeld `v=DMARC1; p=none; rua=mailto:sabine@estasiweddings.nl` (later aanscherpen naar `p=quarantine`). Een bestaand SPF-record op het hoofddomein (van de mailbox) blijft zoals het is.

### Uploads van Your Wedding Space

Bestanden van Your Wedding Space (coverfoto, moodboard, documenten, samenvattingen) gaan rechtstreeks van de browser naar de privé bucket `wedding-space` in Supabase Storage, niet via Render:

1. Het uploadveld (`src/components/ws/FileUpload.tsx`) controleert type en grootte en maakt foto's eerst kleiner (maximaal 2400 px, JPG).
2. De server action `requestUpload` controleert wie het vraagt en geeft een eenmalige upload-link. In `files` komt een regel met status `pending`.
3. De browser stuurt het bestand naar die link en zet alleen het id in het formulier.
4. De actie die het formulier ontvangt controleert of het bestand echt is aangekomen en zet de status op `ready`. Uploads die nooit gekoppeld zijn, worden na een dag opgeruimd.
5. Bekijken gaat via `/api/ws-bestanden/[id]`: eerst de toegangscontrole, daarna een link naar Storage die tien minuten geldig is.

Grenzen (Supabase Free: 50 MB per bestand, 1 GB in totaal): foto's tot 15 MB (na verkleinen meestal een paar honderd kB), documenten tot 25 MB, audio tot 45 MB. Boven 900 MB in totaal weigert de app nieuwe uploads (`WS_STORAGE_BUDGET_BYTES`). De bucket maakt migratie `0005` aan. Oudere bestanden die nog in de database staan blijven gewoon werken. Zonder Supabase (lokaal), of met `WS_DIRECT_UPLOADS=off`, gaat het bestand zoals vroeger met het formulier mee (maximaal 10 MB).

Er is geen schijf en geen `SESSION_SECRET` nodig. `DATA_BACKEND` is niet meer nodig: staat hij nog in de hosting, dan doet hij niets en mag hij weg.

## Your Wedding Space (portaal per bruidspaar)

De opvolger van Sabine's Notion-template, op basis van haar document *Reverse engineering: Your Wedding Space* en de schets. Het zit in deze app: één login, één beheer, dezelfde database (eigen schema `wedding_space`, zodat tabellen nooit botsen met de Academy).

**Sabine (beheer, onder "Your Wedding Space" in het menu)**
* Bruidsparen: aanmaken als concept met één of meer pakketten (Weddingplanner, Ceremoniemeester, Openingsdans). Het portaal staat meteen klaar met starttaken, meetings, draaiboek-tabbladen, RSVP-formulieren voor Daggasten en Avondgasten, meeneemlijsten, stylingplekken, eetmomenten en opdrachten; het bruidspaar ziet niets totdat Sabine op "Maak beschikbaar en deel" klikt. Pakketten later toevoegen of weghalen kan op Gegevens & delen
* Dashboard met meldingen (opdracht afgerond, nieuwe favorieten bij de aanraders), Mijn takenbord en Mijn agenda
* Pakketten (met soort: die bepaalt het menu; volgorde met slepen of pijltjes, geldt overal; verbergen, of verwijderen zolang geen bruidspaar het heeft), Openingsdans (video, de dans-pakketten als kaarten, interesse-aanvragen), Mailgeschiedenis (alle mails, mislukte opnieuw versturen), Opdrachten (ook de delen van Thema & Styling: teksten, vragen, Pinterest-borden, voorbeeld), Aanraders (leveranciers met foto, brochure en haar ervaring), Standaardlijsten (plekken in het stylingplan, eetmomenten, meeneemlijsten, tekst bij de groepsfoto's), Instellingen portaal

**Het portaal (`/k/...`, eigen huisstijl: Playfair Display, goud `#A89650`, bordeaux `#6B1E2E`)**
* Menu per pakket: alleen de openingsdans geeft Overzicht, Afspraken, De openingsdans en Facturen & Offertes; andere pagina's zijn dan ook via een link niet bereikbaar. Sabine ziet altijd alles. Overzicht is een huisje. De openingsdans staat altijd in het menu: zonder openingsdans in het pakket is het een informatiepagina met video, de pakketten en een knop voor een interesse-aanvraag (mail naar Sabine)
* Overzicht: cover, vaste welkomsttekst, tegels, blok Binnenkort (afspraken en "Binnenkort betalen"), takenbord, vragenblok (een antwoord blijft zichtbaar tot het bruidspaar het opent; melding per mail zonder het antwoord), contactkaart
* Jullie pakket: de pakketten, meetings met samenvatting, extra documenten (vast voor alle bruidsparen of per bruidspaar). Facturen & Offertes: documenten van Sabine
* Draaiboek: dagplanning met namen in kleur, meegroeiende velden, slepen of pijltjes, rijen van Sabine op slot voor het bruidspaar; opstelling (diner en ceremonie, gasten plaatsen); meeneemlijsten; stylingplan; groepsfoto's; gastenlijst voor op de dag; leveranciers; printen met keuze per tabblad
* Jullie leveranciers: alles direct invulbaar, vijf statussen, meerdere per categorie, eigen categorieën, aanraders met favorieten
* Gastenlijst & RSVP: gastenlijst per gastengroep, uitnodigingslijst (Excel importeren en downloaden), formulieren met standaardvragen, eigen vragen (met "alleen tonen als"), headerfoto, bevestigingsmails met alle antwoorden (bij elke gast zichtbaar of die verstuurd is), QR-codes, mailgeschiedenis (alleen lezen voor het bruidspaar), mail sturen aan één of meer gasten (alleen Sabine, met vaste afsluiting)
* Eten & allergieën: eetmomenten, wie eet er mee (personen, eigen groepen, RSVP-groepen met automatische aantallen), allergielijst (kopiëren of PDF), deel van de dag per gast
* Stylingplan & Moodboard: plan per plek (wat, wie, klaargezet, afbeeldingen), moodboard, samenvatting met AI als concept dat Sabine vrijgeeft
* Opdrachten: vragen, of opdrachten in delen met notitievelden en "Opdracht afgerond"; Budgetplanning met de begroting
* Kosten: begroot, werkelijk, verschil, aanbetaald, resterend, betaaldatum, cirkeldiagram, pakketregels van Estasi
* De openingsdans: wensen van het bruidspaar (dans, muziek met audiobestand, inspiratie) en notities van Sabine

**Beveiliging**: elke pagina, actie en elk bestand van een bruidspaar loopt via `requireCouple` (`src/lib/ws/access.ts`): een bruidspaar ziet alleen het eigen, gedeelde portaal. Bestanden staan in Supabase Storage (zie Uploads). RSVP-formulieren zijn openbaar via een moeilijk te raden link, met een limiet per IP en een honeypot. De tabellen hebben row level security aan en geen rechten voor de publieke Supabase API.

**AI**: met `ANTHROPIC_API_KEY` worden opdrachten samengevat en maakt "Samenvatting maken" een concept-stylingplan met voorstellen per plek (model Claude Opus 5.5; een samenvatting kost een paar cent). Zonder sleutel schrijft Sabine die zelf.

**Lokaal**: Your Wedding Space heeft een Postgres-database nodig. Zet `DATABASE_URL` naar een lokale database, draai `node scripts/migrate.mjs` en start de app. Op een lege lokale database heeft migratie 0001 de Supabase-schema's `auth` en `storage` nodig; voor alleen Wedding Space kun je die als lege stubs aanmaken (zie de testopzet in de commitgeschiedenis) of tegen een Supabase-branch werken.

## Voorstel fase 1: betalen en toegang

Totdat de betaalprovider gekozen is: betaling buiten het platform (factuur of betaallink), daarna maakt de opleider de cursist aan via **Cursist toevoegen** en stuurt de activatielink. De code is daarop voorbereid: de stap "account + inschrijving aanmaken" (`createStudent` in `src/app/actions/admin.ts`) kan later één op één worden aangeroepen vanuit een betaal-webhook (bijvoorbeeld Mollie) voor automatische activatie.

## Nog open (uit het bouwplan)

* E-mails voor certificaat en vervalmelding (30 dagen vooraf). Uitnodiging en wachtwoordherstel lopen via Supabase; lokaal komt de herstellink in de serverlog en toont het beheer de activatielink
* Huisstijl: kleuren nu volgens het bouwplan (wit, goud `#A4914A`, bordeaux `#722F37`) met Cormorant Garamond en Inter, centraal in `src/app/globals.css`. Goud is voor tekst verdonkerd naar `#6F6230` vanwege leesbaarheid
* Videoplatform (advies: Vimeo met domeinbeperking), back-ups, bewaartermijnen en privacyverklaring
