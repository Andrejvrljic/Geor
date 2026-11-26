# 💎 Kristallfabrik – KI-Lernlabor als Spiel

Die drei Lernblätter des KI-Lernlabors als kurzes, interaktives Spiel (ca. 5 statt 17 Minuten).
Am Anfang wählt man, wie man spielt – mit Beschreibung und Mission jeder Gruppe:

| Gruppe | Name | So wird gespielt |
|---|---|---|
| 🧠 A | Die Selberdenker | Ohne KI. Ein Tipp ist erlaubt (kostet Punkte). |
| 🤖 B | Die KI-Löser | Ein KI-Roboter zeigt die vollständige Lösung. Danach rechnet man sie selbst nach. In Level 2 ist sie zugeklappt. |
| 🧭 C | Die KI-Trainer | Ein KI-Coach stellt nur Fragen und gibt kleine Hinweise, aber keine Werte. |

Die „KI“ im Spiel ist fest programmiert. Es werden keine Daten an einen KI-Dienst geschickt.

**Drei Levels:** 1 · Code knacken (Code-Schloss) → 2 · Denkweg (Schritt-Karten ordnen, mit Falle) → 3 · Kristall-Packung (5 Kristalle = 27).
Dazu gibt es Punkte, Sterne, Zeitbonus, Konten (nur Spitzname), eine Rangliste pro Gruppe und einen **Live-Raum** für die ganze Klasse.
Live-Räume können **nur Lehrkräfte** erstellen (mit dem Lehrkraft-Code). Sie leiten den Raum, spielen aber nicht mit. Kinder treten mit dem Raum-Code bei.
Die **Lehrkraft-Ansicht** vergleicht die drei Gruppen und bietet einen CSV-Export.

## Online

`https://kristallfabrik.dinnerboneagg.workers.dev`

- **Worker** (`cloudflare/worker.js`): liefert die Spielseite aus (`public/`) und beantwortet die API.
- **Durable Object** `RoomDO`: ein Live-Raum pro Raum-Code (WebSocket `/ws?room=CODE`).
- **D1** `kristallfabrik-db`: Konten, Spielrunden (Fortschritt) und Rangliste. Der Workflow legt sie an, falls es sie noch nicht gibt.

Bei jedem Merge auf `main` veröffentlicht `.github/workflows/cloudflare.yml` automatisch. Danach wartet ein Live-Test, bis die neue Version online ist,
und prüft Seite, Datenbank und Multiplayer. Anschließend löscht er seine Testkonten (`kftest…`).
Bei Pull Requests läuft `.github/workflows/ci.yml` mit dem kompletten Server lokal im Cloudflare-Simulator.

### GitHub-Secrets (Settings → Secrets and variables → Actions)

| Secret | Pflicht | Wofür |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | ja | derselbe Token wie bei ECLIPSE/Brawl (Workers Scripts: Edit, D1: Edit) |
| `ADMIN_CODE` | empfohlen | Lehrkraft-Code: für die Auswertung und zum Erstellen von Live-Räumen. Ohne ihn sind beide gesperrt. Ein neuer Code gilt erst nach der nächsten Veröffentlichung. |
| `CLOUDFLARE_ACCOUNT_ID` | nein | wird sonst automatisch ermittelt |

## Lokal

```bash
npm test                                   # Spielregeln
npx wrangler dev                           # Server mit lokaler D1 + Durable Object
TEST_URL=http://127.0.0.1:8787 npm run test:live
```
