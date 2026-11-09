# Subverwerkers

Bedrijven die namens Estasi Weddings persoonsgegevens verwerken voor de Wedding Plan Academy en Your Wedding Space. Met elk van deze partijen is (of wordt) een verwerkersovereenkomst (DPA) gesloten. Deze lijst bijwerken zodra er een partij bijkomt of afvalt, en dan ook de privacytekst onder Beheer, Instellingen nalopen.

Laatst bijgewerkt: 9 november 2026

| Subverwerker | Doel | Welke gegevens | Locatie van de verwerking | Waarborg |
| --- | --- | --- | --- | --- |
| **Resend** (Resend, Inc., San Francisco, VS) | Versturen van alle e-mail van de app: uitnodigingen, inloglinks, vragen en antwoorden, RSVP-bevestigingen, meldingen, Academy-meldingen en (via SMTP) de mails van Supabase Auth | E-mailadres en naam van de ontvanger, onderwerp en inhoud van de mail, afleverstatus (bezorgd, gebounced, als spam gemeld) | Volgens de regio van het verzenddomein bij Resend; kies bij het toevoegen van het domein de EU-regio (Ierland). Resend zelf is gevestigd in de VS | DPA van Resend, EU-standaardcontractbepalingen (SCC's) en het EU-US Data Privacy Framework |
| **Supabase** (Supabase, Inc., VS) | Database, inloggen (Supabase Auth) en bestandsopslag (bucket `academy`) | Alle gegevens van de app: accounts, profielen, opdrachten, portfolio, bruidsparen, gasten en RSVP's, bestanden | Regio van het Supabase-project (EU aanbevolen, bijvoorbeeld Frankfurt) | DPA van Supabase, SCC's |
| **Render** (Render Services, Inc., VS) | Hosting van de webapp | Alle gegevens die door de app gaan (verwerking in het geheugen), serverlogs | Frankfurt (EU), zie `render.yaml` | DPA van Render, SCC's |
| **Anthropic** (Anthropic, PBC, VS) | Samenvattingen van opdrachten (Thema & Styling, Thema & Moodboard en andere ingestuurde opdrachten). Standaard via Claude met de MCP-koppeling op het account van Sabine; optioneel via de API als `ANTHROPIC_API_KEY` is ingesteld | De antwoorden van het bruidspaar op de opdracht die wordt samengevat, en wat Claude via de MCP-tools opvraagt (alleen als Sabine dat vraagt) | VS | DPA van Anthropic (commerciële voorwaarden), SCC's. Let op: gebruik voor Claude een Team- of Enterprise-account of zet onder Privacy het gebruik van gesprekken voor training uit; API-gegevens worden niet gebruikt voor training |

## Resend

* Website: https://resend.com
* Privacybeleid: https://resend.com/legal/privacy-policy
* DPA: https://resend.com/legal/dpa
* Subverwerkers van Resend zelf: https://resend.com/legal/subprocessors (onder andere Amazon Web Services voor de aflevering)
* Bewaartermijn bij Resend: de inhoud en de logs van verstuurde mails blijven een beperkte tijd zichtbaar in het Resend-dashboard (afhankelijk van het abonnement). De app bewaart zelf een kopie in de mailgeschiedenis (`mail_log`), behalve de tekst van mails met een inloglink
* Instellen: zie de README onder *E-mail via Resend*

## Niet als subverwerker aangemerkt

* **Pushdiensten van browsers** (Apple, Google, Mozilla): pushmeldingen gaan versleuteld via de pushdienst van de browser van de gebruiker; de inhoud is voor die dienst niet leesbaar.
