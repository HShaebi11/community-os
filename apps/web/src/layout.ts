export function page(title: string, body: string, opts?: { origin?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)}</title>
  <style>
    :root { --ink:#1c1914; --paper:#f4efe4; --rule:#d9d0bf; --accent:#b4472a; --muted:#6b6458; }
    * { box-sizing:border-box }
    body { margin:0; font:16px/1.45 "Iowan Old Style", Palatino, "Palatino Linotype", serif; background:var(--paper); color:var(--ink); }
    a { color:var(--accent) }
    header, main, footer { max-width: 52rem; margin: 0 auto; padding: 1.25rem 1.25rem; }
    header { display:flex; justify-content:space-between; align-items:baseline; border-bottom:1px solid var(--rule); }
    h1 { font-size: 1.8rem; letter-spacing:-0.03em; margin:0 0 .5rem; }
    h2 { font-size: 1.15rem; margin: 1.5rem 0 .4rem; }
    .muted { color:var(--muted); font-size:.92rem }
    .card { border:1px solid var(--rule); padding:1rem; margin:.7rem 0; background:#fffdf8; }
    label { display:block; margin:.6rem 0 .2rem; font-size:.9rem }
    input, textarea, select { width:100%; padding:.55rem .6rem; border:1px solid var(--rule); background:#fff; font:inherit }
    button, .btn { display:inline-block; margin-top:.8rem; padding:.5rem .9rem; border:1px solid var(--ink); background:var(--ink); color:var(--paper); font:inherit; cursor:pointer; text-decoration:none }
    button.ghost, .btn.ghost { background:transparent; color:var(--ink) }
    nav a { margin-left: .8rem; font-size:.95rem }
    .qr { width: 160px; height:160px }
    .qr svg { width:100%; height:auto }
    ul { padding-left: 1.1rem }
  </style>
</head>
<body>
  <header>
    <a href="${opts?.origin ?? ""}/" style="color:inherit;text-decoration:none"><strong>Community OS</strong></a>
    <nav>
      <a href="/desk">Desk</a>
      <a href="/docs">API</a>
    </nav>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
