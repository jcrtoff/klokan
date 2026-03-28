(function (script) {
  var brokerId = script ? script.getAttribute('data-broker') : null;
  if (!brokerId) return;

  var origin;
  try {
    origin = new URL(script.src).origin;
  } catch (e) {
    origin = window.location.origin;
  }

  var chatUrl = origin + '/chat?broker=' + encodeURIComponent(brokerId);

  // ── Styles ──────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent =
    '#klokan-bubble{position:fixed;bottom:24px;right:24px;z-index:99999;}' +
    '#klokan-toggle{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1E4FFF,#00E0D6);border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .2s;}' +
    '#klokan-toggle:hover{transform:scale(1.08);}' +
    '#klokan-panel{position:fixed;bottom:92px;right:24px;width:375px;height:600px;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.2);z-index:99999;border:none;display:none;}' +
    '#klokan-panel.open{display:block;}' +
    '@media(max-width:440px){#klokan-panel{width:calc(100vw - 16px);right:8px;bottom:84px;height:70dvh;}#klokan-bubble{bottom:16px;right:16px;}}';
  document.head.appendChild(style);

  // ── Chat bubble button ───────────────────────────────────────────────────
  var bubble = document.createElement('div');
  bubble.id = 'klokan-bubble';

  var btn = document.createElement('button');
  btn.id = 'klokan-toggle';
  btn.setAttribute('aria-label', 'Ouvrir le chat');

  var iconChat = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var iconClose = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  btn.innerHTML = iconChat;
  bubble.appendChild(btn);

  // ── Iframe panel ─────────────────────────────────────────────────────────
  var iframe = document.createElement('iframe');
  iframe.id = 'klokan-panel';
  iframe.setAttribute('title', 'Klokan Chat');

  var open = false;
  btn.addEventListener('click', function () {
    open = !open;
    // Load iframe src on first open to avoid preloading
    if (open && !iframe.src) iframe.src = chatUrl;
    iframe.classList.toggle('open', open);
    btn.setAttribute('aria-label', open ? 'Fermer le chat' : 'Ouvrir le chat');
    btn.innerHTML = open ? iconClose : iconChat;
  });

  document.body.appendChild(iframe);
  document.body.appendChild(bubble);
})(document.currentScript);
