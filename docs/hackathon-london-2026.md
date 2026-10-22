# Grok Bot Community Engineering London Hackathon

Source: [hackathon site](https://gb-community-eng-hackathon-10-2026.teamdeel.workers.dev/hackathon) (captured 22 Oct 2026). Track briefs live in page dialogs (`data-track`). Data kit: [/data-kit](https://gb-community-eng-hackathon-10-2026.teamdeel.workers.dev/data-kit). Register: [luma.com/eveur09a](https://luma.com/eveur09a).

**Tagline:** Build open-source tools that London community leads will actually use.

Thursday 22 Oct 2026 · 18:00–23:00 · Expedite London HQ — 7 Lyric Square. Solo or teams of up to 5. Code freeze 21:50. Top 5 live demos, 3 minutes each.

---

## Shared rules

- Public GitHub repo with **MIT, Apache-2.0 or AGPL-3.0** licence file.
- Six judging criteria, each 1–5: technical execution; open source / another community could run it next week; use of community context; better than what leads use today; real-world usefulness; demo quality.
- Never load private member data into a public repo. Use opt-in or a lead’s data in the room only.

**Official Luma API** needs Luma Plus and covers *your own* calendar. Public Luma discover / event JSON / .ics are undocumented — cache, few calls a minute. **Zero Luma sync** pulls guests into a CRM pipeline.

**WhatsApp:** Cloud API is 1:1, limited groups. Baileys / whatsapp-web.js unofficial and against ToS — spare test number only.

---

## Track 1 · Gatekeeper (vetting & moderation)

**Brief:** Review applications, keep scammers out, share a blocklist across groups.

**Problem:** Leads read every application by hand. A scammer kicked from one WhatsApp group joins the next. No shared blocklist. Chat apps have weak moderation.

**Leads said:** Fit-to-community, not just “are they real?”. Every removal is manual.

**Build:** Application reviewer (accept / ask / decline + why) in Supabase. Shared blocklist (hashed phones/handles, evidence, reporter, appeal; RLS until confirmed). WhatsApp/Discord bot that flags scams and *drafts* removal — human sends. Review queue for borderline cases.

**Winning demo:** Applicant scored and routed with a reason. Known scammer blocked on a second group.

**Data offered:** Unicorn Mafia (events, channel history, member info with consent, WhatsApp bot). AI Agent Lab (most data except API access).

**Track judging:** Right accept/decline on a test set; clear reasons; few false blocks; time saved.

---

## Track 2 · Know Your Members (intros & speakers)

**Brief:** Find out who members are, introduce them, find speakers among them.

**Problem:** Members are phone numbers. Nobody gets intro’d. Threads die. Panellists = who you already know.

**Leads said:** 1000+ members known only by phone; chat collapsed. Co-working wants who comes back and why. Want a few questions per member and to *use* the answers. Finding panellists/demoers is slow.

**Build:** Opt-in questionnaire over WhatsApp/Discord → member graph (Cognee or Supabase). Intro bot: one good intro a week per member, with why, still works a month later. Speaker finder for a topic with proof (GitHub, Devpost, HN, Luma hosts). Thread reviver that drafts nudges and logs failures.

**Winning demo:** An intro or revived thread no organiser made by hand, end to end. Then a speaker shortlist with evidence.

**Suggested stack:** Cognee (graph), Supabase (answers/consent), Notion (lead view), Grok Bot (intros).

**Data offered:** The Hack Collective — Luma subscriber export (~450 names/emails, consent) + synthetic profiles (room only, don’t commit). AI Pilled — Luma history + LinkedIn posts (public) for speaker finder.

**Track judging:** Quality of intros and speaker picks; evidence; honesty about failures; would a lead run it every week.

---

## Track 3 · Event Autopilot (run sheet, promo, newsletter)

**Brief:** One event → run sheet, posts, visuals, newsletter. Lead approves with one click.

**Problem:** Event page, visuals, posts, newsletter, volunteer chasing — all by hand every week.

**Leads said:** Venues, food, suppliers, pages, money, volunteers live in different places. Visuals take hours; image models aren’t shippable. Newsletter/group/social written weekly. Volunteer burnout on admin.

**Build:** Notion event workspace (notes → run sheet, budget, rota). Promo pipeline: copy, *code* visual templates (not image models), Ghost newsletter, WhatsApp/LinkedIn/Discord posts — lead approves each. Weekly digest from Luma. Night-of helper: check-in, timings, last-minute group pushes.

**Winning demo:** One-line idea → run sheet, visuals, newsletter, posts. Show volunteer hours saved.

**Stack:** Notion, Supabase, Zero (Luma guests → follow-ups), Grok Bot, Cursor.

**Data offered:** Outpost — past events/channel history, anonymised CSVs. AI Pilled — Luma + LinkedIn for voice/visual style.

**Track judging:** How much weekly work runs itself; copy/visual quality; hours saved; would a lead trust a real event.

---

## Track 4 · Open Venue & Events DB

**Brief:** Open DB of London venues, communities, events that approved organisers keep together.

**Problem:** Free evening/weekend venues live in people’s heads. No up-to-date city community list. Shared calendars filled by hand. Builders want ranked events, not filler. Communities shouldn’t compete — one shared agent.

**Build:** Venue DB (capacity, AV, hours, free/paid, contact, who hosted) — approved organisers only, vouch for each other; Supabase + PostGIS. Communities directory from Luma calendars. Events layer: Luma, Devpost, BuilderBase, Meetup → one London calendar, ranked, .ics. Outreach to Luma hosts. Shared agent: “free space for 80 next Thursday near Old Street?”

**Winning demo:** Two organisers add real venues. A third finds one in chat and sends the request. Ranked feed + .ics update live.

**Data offered:** Hack Radar scraped events. The Hack Collective public Luma calendar of London hackathons.

**Track judging:** Real venues tonight; trust model vs junk; speed to find a venue; would three leads post tomorrow.

---

## Track 5 · Front Desk & Revenue

**Brief:** Answer inbound in chat, price bookings fairly, find sponsors.

**Problem:** Requests, quotes, pricing, sponsor deals happen in group chats and DMs. That decides whether events happen.

**Leads said:** Communities book often, no budget; companies book rarely, pay a lot. Want automatic first reply in chat. Requests lost in WhatsApp; need a ranked task list and failure logs. Sponsors live in heads and spreadsheets.

**Build:** Pricing engine on real booking history (community vs company, explained). Inbound bot: qualify, quote or book a call. Front desk: every message → task, owner, priority. Sponsor CRM: Luma hosts + Devpost organisers, size with Companies House, draft email (Zero or Twenty).

**Winning demo:** Chat request → qualified, priced from history, quoted → likely sponsor + drafted email.

**Data offered:** Night Office — redacted events and what was paid, for pricing.

**Track judging:** Prices that make sense on held-out bookings; fast correct replies; sponsor fit; would a venue use it.

---

## Wildcard · Weird Stuff

Own community idea. Name the community, show what hurts, show it working on real data or with a lead in the room.

---

## Tech partners

| Partner | Role | Night contact |
|---|---|---|
| [Supabase](https://supabase.com) | Postgres, auth, storage, realtime | Isabelle Roser |
| [Cognee](https://www.cognee.ai) | Memory layer for agents (docs, chats) | Luca Stromann |
| [Zero](https://zero.inc) | GTM OS; [Luma sync](https://docs.zero.inc/settings/integrations/luma); MCP/API | Mariia Nedelkina |
| [Notion](https://www.notion.com) | Docs/DBs; [Notion MCP](https://developers.notion.com/docs/mcp) | Waseef Mohammad Khan |
| [Grok Bot skill](https://github.com/adamanz/grok-bot-skill) | Agent + community context | Francisco Terpolilli |
| [Cursor](https://cursor.com) | IDE, [CLI](https://cursor.com/docs/cli/overview), [SDK](https://cursor.com/docs/sdk/typescript) | Francisco Terpolilli |

Venue: Expedite / William Schulz.

---

## People (organisers, communities, judges)

**Host / co-org:** Francisco Terpolilli (Cursor / SpaceXAI), Keanu Czirjak (Hackradar), Louis Le (The Hack Collective).

**Community leads / judges include:** Charlie Cheesman (Unicorn Mafia), Fatema Al Khalifa (basedcollective), Ilya Vencjuns + Peter Ashiagbor (Kickstart Global), May Yu + Minghan Xiao (AI Agents Lab), Claudia Maggi (Corgi Community), Oli Kingshott + Shreyas Raghu (Night Office), Umberto Belluzzo (United Italian Societies), Andy Tyler + Oscar Falemara (Outpost), Nuan Zhang + Yiran Qin (AI Pilled), Hela Hałas (Imperial Entrepreneurs), Zakee Abdi, Luca Stromann (cognee), William Schulz (Expedite).

---

## Prizes

1st: 3 months Cursor Ultra per person + Supabase credits. 2nd: 2 months + credits. 3rd: 1 month + credits.

---

## Data starter kit (public, tested 22 Oct)

Full snippets: [/data-kit](https://gb-community-eng-hackathon-10-2026.teamdeel.workers.dev/data-kit).

- **Luma discover (London)** — `api.lu.ma/discover/get-paginated-events?discover_place_api_id=discplace-QCcNk3HXowOR97j`
- **Luma event JSON** — `api.lu.ma/event/get?event_api_id=evt-…` (hosts with LinkedIn/X/website)
- **Luma calendar .ics** — `api.lu.ma/ics/get?entity=calendar&id=cal-…`
- Meetup page JSON, Eventbrite JSON-LD, dev.events, Devpost hackathons + project search, MLH, BuilderBase discovery, GitHub REST, HN Algolia, Companies House, Hugging Face SMS spam

---

## Mapping to our product (ideation, not the site)

Leads already named five jobs. The **community + member brain** is the shared layer:

| Track | How our product covers it |
|---|---|
| Know Your Members | Member memory (do / want / offer), intros, speakers |
| Event Autopilot | After a proposal is live: run sheet, promo, native + Luma page |
| Open Venue DB | Venues as users + prefs; match rooms to demand |
| Front Desk & Revenue | Sponsors as users; inbound + guests from Luma/native |
| Gatekeeper | Later, on the same member graph |
| Weird Stuff | The brain itself: save everything, organise, public face + QR |

Native hub + pipes (Discord/Slack/WhatsApp export, Luma guests, MCP, Cloudflare Code Mode).
