import { esc, page } from "./layout.ts";

export function homePage(): string {
  return page(
    "Community OS",
    `<h1>Your community, remembered.</h1>
     <p>Import the chat. See the people. Make the event. Own the door.</p>
     <p><a class="btn" href="/desk">Open the desk</a></p>`,
  );
}

export function communityPage(input: {
  name: string;
  slug: string;
  joinUrl: string | null;
  events: Array<{ slug: string; title: string }>;
}): string {
  return page(
    input.name,
    `<h1>${esc(input.name)}</h1>
     <p class="muted">The official front door. Chat still lives where it already lives.</p>
     ${input.joinUrl ? `<p><a class="btn" href="${esc(input.joinUrl)}">Join the chat</a></p>` : ""}
     <h2>Next events</h2>
     ${
       input.events.length
         ? input.events.map((e) => `<div class="card"><a href="/e/${esc(e.slug)}">${esc(e.title)}</a></div>`).join("")
         : `<p class="muted">Nothing published yet.</p>`
     }
     <p class="muted">Share <code>/c/${esc(input.slug)}</code></p>`,
  );
}

export function eventPage(input: {
  title: string;
  slug: string;
  communityName: string;
  communitySlug: string;
  explanation: string | null;
  qrSvg: string;
  speakers: Array<{ name: string; slug: string | null }>;
}): string {
  return page(
    input.title,
    `<p class="muted"><a href="/c/${esc(input.communitySlug)}">${esc(input.communityName)}</a></p>
     <h1>${esc(input.title)}</h1>
     ${input.explanation ? `<p>${esc(input.explanation)}</p>` : ""}
     <h2>Speakers</h2>
     <ul>${input.speakers
       .map((s) =>
         s.slug
           ? `<li><a href="/m/${esc(s.slug)}">${esc(s.name)}</a></li>`
           : `<li>${esc(s.name)}</li>`,
       )
       .join("")}</ul>
     <div class="qr">${input.qrSvg}</div>
     <form class="card" method="post" action="/e/${esc(input.slug)}/rsvp">
       <h2>RSVP</h2>
       <label>Name</label><input name="name" required/>
       <label>Email</label><input name="email" type="email" required/>
       <button>I’m coming</button>
     </form>`,
  );
}

export function memberPage(input: { name: string; do: string | null; offer: string | null }): string {
  return page(
    input.name,
    `<h1>${esc(input.name)}</h1>
     <p class="muted">Public ID card — opted in by the member / lead.</p>
     <div class="card">
       <p><strong>Does:</strong> ${esc(input.do ?? "—")}</p>
       <p><strong>Offers:</strong> ${esc(input.offer ?? "—")}</p>
     </div>`,
  );
}

export function docsPage(): string {
  return page(
    "API",
    `<h1>HTTP API</h1>
     <p class="muted">The product is this API. Desk, public pages, and MCP are clients.</p>
     <ul>
       <li><code>POST /v1/auth/dev</code> or Better Auth <code>/api/auth/*</code></li>
       <li><code>POST /v1/workspaces</code></li>
       <li><code>POST /v1/workspaces/:id/imports</code> (zip or txt body)</li>
       <li><code>GET /v1/workspaces/:id/members</code></li>
       <li><code>POST /v1/workspaces/:id/memory</code></li>
       <li><code>GET /v1/members/:id</code> (card + citations)</li>
       <li><code>GET /v1/demands/:id</code> (title + citations)</li>
       <li><code>GET /v1/workspaces/:id/demands</code></li>
       <li><code>POST /v1/workspaces/:id/proposals</code></li>
       <li><code>POST /v1/proposals/:id/go-live</code></li>
       <li><code>POST /v1/ingest/discord</code></li>
     </ul>`,
  );
}
