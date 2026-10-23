import { esc, page } from "./layout.ts";

export function deskPage(): string {
  return page(
    "Lead desk",
    `
    <h1>Desk</h1>
    <p class="muted">Same API a Cursor agent uses. Sign in, import a WhatsApp export, then run the community from memory.</p>
    <div class="card">
      <label>Email</label>
      <input id="email" value="lead@example.com"/>
      <button id="signin">Sign in</button>
      <p class="muted" id="who"></p>
    </div>
    <div class="card">
      <h2>Workspace</h2>
      <label>Community name</label>
      <input id="name" value="Weird Stuff"/>
      <label>Join link (their WhatsApp / Discord)</label>
      <input id="join" placeholder="https://chat.whatsapp.com/..."/>
      <button id="create">Create workspace</button>
      <p class="muted" id="ws"></p>
    </div>
    <div class="card">
      <h2>Import</h2>
      <input id="file" type="file" accept=".zip,.txt"/>
      <button id="import">Upload export</button>
      <p class="muted" id="imp"></p>
    </div>
    <div class="card">
      <button class="ghost" id="memory">Refresh memory</button>
      <pre id="brief" class="muted"></pre>
    </div>
    <div id="people"></div>
    <div id="demands"></div>
    <div id="proposals"></div>
    <div id="events"></div>
    <div id="gate"></div>
    <script>
      const state = { token: localStorage.getItem("cos_token"), workspaceId: localStorage.getItem("cos_ws") };
      const api = (path, opts={}) => fetch(path, {
        ...opts,
        headers: { "content-type":"application/json", ...(state.token ? { authorization: "Bearer "+state.token } : {}), ...(opts.headers||{}) }
      }).then(async r => {
        const text = await r.text();
        let data; try { data = JSON.parse(text) } catch { data = { error: text } }
        if (!r.ok) throw new Error(data.error || r.statusText);
        return data;
      });
      const who = document.getElementById("who");
      const ws = document.getElementById("ws");
      async function refresh() {
        if (!state.token) return;
        const me = await api("/v1/me");
        who.textContent = me.email;
        if (state.workspaceId) {
          const workspace = await api("/v1/workspaces/"+state.workspaceId);
          ws.innerHTML = "Workspace "+state.workspaceId+" · <a href='/c/"+escHtml(workspace.slug)+"'>/c/"+escHtml(workspace.slug)+"</a>";
          const brief = await api("/v1/workspaces/"+state.workspaceId+"/briefing");
          document.getElementById("brief").textContent = JSON.stringify(brief, null, 2);
          const members = await api("/v1/workspaces/"+state.workspaceId+"/members");
          const cards = await Promise.all(members.map(m => api("/v1/members/"+m.id)));
          document.getElementById("people").innerHTML = "<h2>People</h2>" + cards.map(m =>
            "<div class='card'><strong>"+escHtml(m.displayName)+"</strong><div class='muted'>do: "+escHtml(m.do||"—")+" · want: "+escHtml(m.want||"—")+" · offer: "+escHtml(m.offer||"—")+"</div>"+
            (m.citations && m.citations[0] ? "<div class='muted'>“"+escHtml(m.citations[0].quote)+"”</div>" : "")+
            (m.publicOptIn && m.publicSlug ? "<p><a href='/m/"+escHtml(m.publicSlug)+"'>Public ID</a></p>" : "<button data-public='"+m.id+"'>Public ID</button>")+
            "</div>"
          ).join("");
          document.querySelectorAll("[data-public]").forEach(btn => btn.onclick = async () => {
            await api("/v1/members/"+btn.dataset.public, { method:"PATCH", body: JSON.stringify({ publicOptIn: true }) });
            refresh();
          });
          const demands = await api("/v1/workspaces/"+state.workspaceId+"/demands");
          document.getElementById("demands").innerHTML = "<h2>Demand</h2>" + demands.map(d =>
            "<div class='card'><strong>"+escHtml(d.title || d.topic)+"</strong> · "+d.memberIds.length+" people<button data-demand='"+d.id+"'>Open proposal</button></div>"
          ).join("");
          document.querySelectorAll("[data-demand]").forEach(btn => btn.onclick = async () => {
            await api("/v1/workspaces/"+state.workspaceId+"/proposals", { method:"POST", body: JSON.stringify({ demandId: btn.dataset.demand }) });
            refresh();
          });
          const proposals = await api("/v1/workspaces/"+state.workspaceId+"/proposals");
          document.getElementById("proposals").innerHTML = "<h2>Proposals</h2>" + proposals.map(p =>
            "<div class='card'><div class='muted'>"+escHtml(p.status)+"</div><p>"+escHtml(p.explanation||"")+"</p>"+
            (p.outreachDraft ? "<pre class='muted'>"+escHtml(p.outreachDraft)+"</pre>" : "<button data-draft='"+p.id+"'>Draft outreach</button>")+
            (p.status==="draft" ? "<button data-approve='"+p.id+"'>Approve</button>" : "")+
            (p.status==="approved" ? "<button data-live='"+p.id+"'>Go live</button>" : "")+
            "</div>"
          ).join("");
          document.querySelectorAll("[data-draft]").forEach(btn => btn.onclick = async () => {
            await api("/v1/proposals/"+btn.dataset.draft+"/outreach", { method:"POST" });
            refresh();
          });
          document.querySelectorAll("[data-approve]").forEach(btn => btn.onclick = async () => {
            await api("/v1/proposals/"+btn.dataset.approve+"/approve", { method:"POST" });
            refresh();
          });
          document.querySelectorAll("[data-live]").forEach(btn => btn.onclick = async () => {
            const ev = await api("/v1/proposals/"+btn.dataset.live+"/go-live", { method:"POST" });
            location.href = "/e/"+ev.slug;
          });
          const events = await api("/v1/workspaces/"+state.workspaceId+"/events");
          const guestLists = await Promise.all(events.map(e => api("/v1/events/"+e.id+"/guests")));
          document.getElementById("events").innerHTML = "<h2>Events</h2>" + events.map((e, i) =>
            "<div class='card'><a href='/e/"+e.slug+"'>"+escHtml(e.title)+"</a>"+
            "<p class='muted'>"+guestLists[i].length+" guests</p>"+
            guestLists[i].map(g => "<div class='muted'>"+escHtml(g.name)+" · "+escHtml(g.email)+"</div>").join("")+
            " <button data-auto='"+e.id+"'>Autopilot drafts</button><pre class='muted' id='auto-"+e.id+"'></pre></div>"
          ).join("");
          document.querySelectorAll("[data-auto]").forEach(btn => btn.onclick = async () => {
            const arts = await api("/v1/events/"+btn.dataset.auto+"/autopilot", { method:"POST" });
            document.getElementById("auto-"+btn.dataset.auto).textContent = arts.map(a => a.kind+"\\n"+a.body).join("\\n\\n");
          });
          const apps = await api("/v1/workspaces/"+state.workspaceId+"/applications");
          document.getElementById("gate").innerHTML = "<h2>Gatekeeper</h2>" +
            "<label>Applicant</label><input id='appl'/><label>Answers</label><textarea id='ans'></textarea><button id='apply'>Score application</button>" +
            apps.map(a => "<div class='card'>"+escHtml(a.applicant)+" · "+a.decision+" · "+escHtml(a.reason)+"</div>").join("");
          document.getElementById("apply").onclick = async () => {
            await api("/v1/workspaces/"+state.workspaceId+"/applications", { method:"POST", body: JSON.stringify({ applicant: document.getElementById("appl").value, answers: document.getElementById("ans").value })});
            refresh();
          };
        }
      }
      function escHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
      document.getElementById("signin").onclick = async () => {
        const data = await api("/v1/auth/dev", { method:"POST", body: JSON.stringify({ email: document.getElementById("email").value })});
        state.token = data.token; localStorage.setItem("cos_token", data.token); refresh();
      };
      document.getElementById("create").onclick = async () => {
        const data = await api("/v1/workspaces", { method:"POST", body: JSON.stringify({ name: document.getElementById("name").value, joinUrl: document.getElementById("join").value })});
        state.workspaceId = data.id; localStorage.setItem("cos_ws", data.id); refresh();
      };
      document.getElementById("import").onclick = async () => {
        const file = document.getElementById("file").files[0];
        if (!file) return;
        const buf = await file.arrayBuffer();
        const res = await fetch("/v1/workspaces/"+state.workspaceId+"/imports?filename="+encodeURIComponent(file.name), {
          method:"POST",
          headers: { authorization: "Bearer "+state.token, "content-type": file.type || "application/octet-stream" },
          body: buf
        });
        const data = await res.json();
        document.getElementById("imp").textContent = "Inserted "+data.inserted+", skipped "+data.skipped+", members "+data.members.length;
        refresh();
      };
      document.getElementById("memory").onclick = async () => {
        await api("/v1/workspaces/"+state.workspaceId+"/memory", { method:"POST" });
        refresh();
      };
      refresh().catch(() => {});
    </script>
    `,
  );
}
