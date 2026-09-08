/* AI Assistant Panel — Estudio de Mercado Educativo
   Conecta con los notebooks de NotebookLM via /api/query
*/
(function () {
  const API = '/api/query';
  const NOTEBOOKS = {
    ibague: 'Universidad de Ibague',
    global: 'Educacion Superior Global'
  };

  // ── Estilos ───────────────────────────────────────────────────────────────
  const css = `
    #ai-toggle {
      position:fixed; bottom:24px; right:24px; z-index:9999;
      width:54px; height:54px; border-radius:50%; border:none; cursor:pointer;
      background:linear-gradient(135deg,#1a1f3c,#2d3561);
      box-shadow:0 4px 16px rgba(0,0,0,.35);
      display:flex; align-items:center; justify-content:center;
      transition:transform .2s, box-shadow .2s;
    }
    #ai-toggle:hover { transform:scale(1.08); box-shadow:0 6px 20px rgba(0,0,0,.45); }
    #ai-toggle svg { width:26px; height:26px; fill:#f59e0b; }
    #ai-badge {
      position:absolute; top:-4px; right:-4px;
      background:#f59e0b; color:#1a1f3c; font-size:9px; font-weight:800;
      border-radius:8px; padding:1px 5px; display:none;
    }
    #ai-panel {
      position:fixed; bottom:88px; right:24px; z-index:9998;
      width:380px; max-width:calc(100vw - 48px);
      background:#fff; border-radius:14px;
      box-shadow:0 8px 32px rgba(0,0,0,.22);
      display:none; flex-direction:column; overflow:hidden;
      font-family:'Segoe UI',system-ui,sans-serif;
    }
    #ai-panel.open { display:flex; }
    #ai-header {
      background:linear-gradient(135deg,#1a1f3c,#2d3561);
      color:#fff; padding:12px 16px;
      display:flex; align-items:center; justify-content:space-between;
    }
    #ai-header h6 { margin:0; font-size:.82rem; font-weight:700; }
    #ai-header small { color:#fcd34d; font-size:.68rem; }
    #ai-header button {
      background:none; border:none; color:#fff; cursor:pointer;
      font-size:1rem; opacity:.7; line-height:1;
    }
    #ai-header button:hover { opacity:1; }
    #ai-selector {
      background:#f0f4ff; border-bottom:1px solid #e2e8f0;
      padding:8px 12px; display:flex; gap:6px; flex-wrap:wrap;
    }
    .ai-nb-btn {
      font-size:.7rem; font-weight:700; padding:3px 10px; border-radius:20px;
      border:2px solid transparent; cursor:pointer; transition:all .15s;
      background:#fff; color:#1a1f3c; border-color:#cbd5e1;
    }
    .ai-nb-btn.active {
      background:#1a1f3c; color:#f59e0b; border-color:#1a1f3c;
    }
    #ai-messages {
      flex:1; overflow-y:auto; padding:12px;
      max-height:320px; min-height:120px;
      display:flex; flex-direction:column; gap:8px;
    }
    .ai-msg { font-size:.78rem; line-height:1.5; border-radius:8px; padding:8px 10px; max-width:92%; }
    .ai-msg.user { background:#f0f4ff; color:#1e293b; align-self:flex-end; border-bottom-right-radius:2px; }
    .ai-msg.bot  { background:#f8fafc; color:#1e293b; align-self:flex-start; border:1px solid #e2e8f0; border-bottom-left-radius:2px; }
    .ai-msg.bot .ai-src { font-size:.65rem; color:#64748b; margin-top:4px; }
    .ai-msg.error { background:#fee2e2; color:#991b1b; align-self:flex-start; }
    .ai-typing { display:flex; gap:4px; padding:10px; align-self:flex-start; }
    .ai-typing span {
      width:6px; height:6px; border-radius:50%; background:#94a3b8;
      animation:aiDot 1.2s infinite ease-in-out;
    }
    .ai-typing span:nth-child(2) { animation-delay:.2s; }
    .ai-typing span:nth-child(3) { animation-delay:.4s; }
    @keyframes aiDot { 0%,80%,100%{transform:scale(0.8);opacity:.5} 40%{transform:scale(1.2);opacity:1} }
    #ai-input-area {
      padding:10px 12px; border-top:1px solid #e2e8f0;
      display:flex; gap:6px; align-items:flex-end; background:#fafafa;
    }
    #ai-input {
      flex:1; border:1px solid #cbd5e1; border-radius:8px;
      padding:7px 10px; font-size:.78rem; font-family:inherit;
      resize:none; min-height:36px; max-height:90px; outline:none;
      transition:border-color .15s;
    }
    #ai-input:focus { border-color:#1a1f3c; }
    #ai-send {
      background:#1a1f3c; color:#f59e0b; border:none; border-radius:8px;
      padding:7px 12px; font-size:.8rem; font-weight:700; cursor:pointer;
      transition:background .15s; white-space:nowrap;
    }
    #ai-send:hover { background:#2d3561; }
    #ai-send:disabled { opacity:.5; cursor:not-allowed; }
    #ai-footer {
      font-size:.6rem; color:#94a3b8; text-align:center;
      padding:4px 8px 6px; background:#fafafa; border-top:1px solid #f1f5f9;
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── HTML del panel ────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'ai-panel';
  panel.innerHTML = `
    <div id="ai-header">
      <div>
        <h6>Asistente de Investigacion</h6>
        <small id="ai-active-label">Notebook: Universidad de Ibague</small>
      </div>
      <button id="ai-close" title="Cerrar">&#10005;</button>
    </div>
    <div id="ai-selector">
      <button class="ai-nb-btn active" data-nb="ibague">U. Ibague</button>
      <button class="ai-nb-btn" data-nb="global">Global / Tendencias</button>
    </div>
    <div id="ai-messages">
      <div class="ai-msg bot">
        Hola. Puedo consultar los notebooks de NotebookLM sobre:<br>
        <strong>U. Ibague</strong>: PDI, programas, empleabilidad, infra...<br>
        <strong>Global</strong>: IA, skills-economy, demografía, OCDE...<br><br>
        &#10024; Pregunta lo que necesites.
        <div class="ai-src">Fuente: NotebookLM / Gemini</div>
      </div>
    </div>
    <div id="ai-input-area">
      <textarea id="ai-input" placeholder="Escribe tu pregunta..." rows="1"></textarea>
      <button id="ai-send">Enviar</button>
    </div>
    <div id="ai-footer">Respuestas basadas exclusivamente en documentos del notebook activo</div>
  `;

  const toggle = document.createElement('div');
  toggle.id = 'ai-toggle';
  toggle.title = 'Asistente NotebookLM';
  toggle.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
      <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12l-2 2H6l-2 2V4h16v10z"/>
    </svg>
    <span id="ai-badge">!</span>
  `;

  document.body.appendChild(panel);
  document.body.appendChild(toggle);

  // ── Estado ────────────────────────────────────────────────────────────────
  let activeNb = 'ibague';
  let busy = false;
  const messagesEl = document.getElementById('ai-messages');
  const inputEl    = document.getElementById('ai-input');
  const sendBtn    = document.getElementById('ai-send');
  const badge      = document.getElementById('ai-badge');

  // ── Helpers ───────────────────────────────────────────────────────────────
  function addMsg(text, type) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + type;
    if (type === 'bot') {
      div.innerHTML = text.replace(/\n/g, '<br>') +
        `<div class="ai-src">Fuente: ${NOTEBOOKS[activeNb]} via NotebookLM</div>`;
    } else {
      div.textContent = text;
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'ai-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  async function sendQuestion() {
    if (busy) return;
    const q = inputEl.value.trim();
    if (!q) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    busy = true;
    sendBtn.disabled = true;

    addMsg(q, 'user');
    const typingEl = showTyping();

    try {
      const resp = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, notebook: activeNb })
      });
      const data = await resp.json();
      typingEl.remove();

      if (data.error) {
        addMsg('Error: ' + data.error, 'error');
      } else {
        addMsg(data.answer || 'Sin respuesta.', 'bot');
        badge.style.display = 'none';
      }
    } catch (err) {
      typingEl.remove();
      addMsg('No se pudo conectar con el servidor. Verifica que server.py esta en ejecucion.', 'error');
    }

    busy = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    badge.style.display = 'none';
    if (panel.classList.contains('open')) inputEl.focus();
  });

  document.getElementById('ai-close').addEventListener('click', () => {
    panel.classList.remove('open');
  });

  sendBtn.addEventListener('click', sendQuestion);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
  });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 90) + 'px';
  });

  document.querySelectorAll('.ai-nb-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeNb = btn.dataset.nb;
      document.querySelectorAll('.ai-nb-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('ai-active-label').textContent =
        'Notebook: ' + NOTEBOOKS[activeNb];
    });
  });

  // ── Verificar conexion con el servidor ───────────────────────────────────
  fetch('/api/status')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(() => { /* servidor OK */ })
    .catch(() => {
      badge.textContent = '!';
      badge.style.display = 'block';
      badge.title = 'Servidor desconectado — ejecuta server.py';
    });
})();
