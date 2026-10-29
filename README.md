# Renoveringskollen

Håll koll på renoveringar i hemmet – projekt, rum, utgifter, kvitton, uppgifter och bilder.

## Kom igång

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed   # valfritt: exempeldata
npm run dev       # startar API (:3100) och webb – öppna http://localhost:5173
```

Första gången visas **Välkommen!** – skapa ditt konto där. Du blir ägare och kan sedan bjuda in
resten av hushållet under **Konto**. Första start måste göras på datorn där appen körs.

## Inloggning

- Lösenord hashas med argon2id; sessioner är en slumpad token i en httpOnly-cookie (SameSite=Lax),
  och bara en hash av token sparas i databasen.
- Ägaren bjuder in medlemmar med engångslänkar som gäller i 7 dagar. Alla delar hushållets data;
  bara ägaren hanterar medlemmar och inbjudningar.
- Fem felaktiga inloggningsförsök spärrar kontot i 15 minuter. Byte av lösenord loggar ut andra enheter.
- Glömt lösenord: ägaren tar bort medlemmen och skickar en ny inbjudan (datan finns kvar).

## Nå appen från andra enheter

Bygg webbappen och kör allt från en port:

```bash
npm run build
npm start          # servern levererar både webb och API på PORT
```

Lägg den sedan bakom **HTTPS** – utan det kan inloggningen avlyssnas på nätverket. Enklast hemma är
[Tailscale](https://tailscale.com): installera på servern och telefonen, och kör

```bash
tailscale serve --bg 3100
```

Sätt sedan i `.env`: `COOKIE_SECURE=true` och `TRUST_PROXY=true` (låt `HOST=127.0.0.1` stå kvar –
Tailscale ansluter lokalt). Appen nås då på `https://<datornamn>.<tailnet>.ts.net` från dina enheter,
men inte från internet. Med Caddy eller en VPS gäller samma två inställningar.

## Struktur

- `shared/` – domänkonstanter (statusar, kategorier, beloppsfunktioner)
- `server/` – Fastify-API, Drizzle + SQLite (`server/src/db/schema.ts`)
- `web/` – React + Vite + Tailwind, TanStack Query (`web/src/api/hooks.ts`)

Belopp lagras i öre (heltal). Servern lyssnar som standard bara på `127.0.0.1`.

## Kommandon

| Kommando              | Vad                                                       |
| --------------------- | --------------------------------------------------------- |
| `npm test`            | Enhets- och API-tester (Vitest)                           |
| `npm run e2e`         | Webbläsartester (Playwright, använder installerad Chrome) |
| `npm run typecheck`   | TypeScript-kontroll                                       |
| `npm run lint`        | ESLint                                                    |
| `npm run db:generate` | Skapa migrering efter schemaändring                       |
| `npm run backup`      | Säkerhetskopiera databas och filer till `backups/`        |

## Säkerhetskopiering

Ägaren kan också trycka på **Säkerhetskopiera nu** under **Konto** och ladda ner kopiorna därifrån
(bara ägaren; samma innehåll och samma mapp `backups/` som kommandot nedan). Kopior som ligger kvar på
samma dator skyddar inte mot att datorn går sönder – ladda ner en och spara den någon annanstans.

```bash
npm run backup              # behåller de 10 senaste
npm run backup -- --keep 30
```

Skapar `backups/renoveringskollen-ÅÅÅÅMMDD-HHMMSS.tar.gz` med databasen och alla kvitton och bilder.
Det går bra att köra medan appen är igång. Kopiera gärna mappen `backups/` till en extern disk eller molnet.

**Återställa:** stoppa appen, packa upp och lägg tillbaka filerna:

```bash
mkdir -p /tmp/aterstall && tar -xzf backups/renoveringskollen-ÅÅÅÅMMDD-HHMMSS.tar.gz -C /tmp/aterstall
cp /tmp/aterstall/renoveringskollen.db data/renoveringskollen.db
rm -f data/renoveringskollen.db-wal data/renoveringskollen.db-shm
cp -R /tmp/aterstall/uploads/. uploads/
```

## E2E-tester

`npm run e2e` startar en egen API-server (port 3101) med tom databas i `e2e/.tmp` och en egen Vite (port 5174),
så din utvecklingsdata och dina körande servrar påverkas inte. Rapport vid fel: `npx playwright show-report e2e/.report`.

## CI

På GitHub kör [CI](.github/workflows/ci.yml) lint, typkontroll, tester, bygge och E2E-tester vid varje push
och pull request.

## API

Alla routes ligger under `/api`. Belopp anges i öre, datum som `ÅÅÅÅ-MM-DD`.
Fel returneras som `{ "error": { "code", "message", "details?" } }`.

| Resurs          | Routes                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rum             | `GET/POST /rooms`, `GET/PATCH/DELETE /rooms/:id`                                                                                                               |
| Mått            | `GET/POST /rooms/:id/measurements`, `PATCH/DELETE /measurements/:id`                                                                                           |
| Projekt         | `GET /projects?status=&roomId=`, `POST /projects`, `GET/PATCH/DELETE /projects/:id`                                                                            |
| Utgifter        | `GET/POST /projects/:id/expenses`, `GET/PATCH/DELETE /expenses/:id`                                                                                            |
| Uppgifter       | `GET/POST /projects/:id/tasks`, `PATCH/DELETE /tasks/:id`                                                                                                      |
| Anteckningar    | `GET /notes?projectId=\|roomId=`, `POST /notes`, `PATCH/DELETE /notes/:id`                                                                                     |
| Hantverkare     | `GET/POST /contractors`, `GET/PATCH/DELETE /contractors/:id`                                                                                                   |
| Säkerhetskopior | `GET/POST /backups`, `GET /backups/:namn/download` (bara ägaren)                                                                                               |
| Underhåll       | `GET/POST /maintenance`, `PATCH/DELETE /maintenance/:id`, `POST /maintenance/:id/done`, `GET /maintenance/:id/history`, `DELETE /maintenance-log/:id`          |
| Bilagor         | `GET /attachments?projectId=\|expenseId=\|roomId=\|quoteId=\|inbox=1`, `POST /attachments` (multipart), `GET /attachments/:id/file`, `DELETE /attachments/:id` |

Bilagor: JPEG, PNG, WebP, HEIC eller PDF, max 10 MB. Filtypen avgörs av filens innehåll.
