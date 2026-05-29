/**
 * Minimal streaming chat UI served as a single HTML string.
 * Zero runtime dependencies — vanilla HTML, CSS, and JavaScript.
 */
export const WEB_UI = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Thiny</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font: 15px/1.6 system-ui, -apple-system, sans-serif;
      background: #f5f5f5;
      display: flex;
      flex-direction: column;
      height: 100dvh;
      max-width: 760px;
      margin: 0 auto;
      padding: 0 16px;
    }
    h1 { padding: 20px 0 12px; font-size: 1.1rem; color: #111; }
    #log {
      flex: 1;
      overflow-y: auto;
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      padding: 16px;
      white-space: pre-wrap;
      font-size: 14px;
      line-height: 1.7;
    }
    .user { color: #555; margin-top: 12px; }
    .user::before { content: "You  "; font-weight: 600; color: #111; }
    .assistant { color: #222; margin-top: 6px; }
    .assistant::before { content: "Thiny  "; font-weight: 600; color: #0066cc; }
    form { display: flex; gap: 8px; padding: 16px 0; }
    input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #ccc;
      border-radius: 8px;
      font-size: 15px;
      outline: none;
    }
    input:focus { border-color: #0066cc; }
    button {
      padding: 10px 20px;
      background: #111;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #333; }
    button:disabled { background: #999; cursor: not-allowed; }
  </style>
</head>
<body>
  <h1>Thiny</h1>
  <div id="log"></div>
  <form id="form">
    <input id="input" autocomplete="off" placeholder="Type a message…" autofocus />
    <button type="submit" id="send">Send</button>
  </form>
  <script>
    const log = document.getElementById('log');
    const input = document.getElementById('input');
    const send = document.getElementById('send');

    function appendMessage(role, text) {
      const div = document.createElement('div');
      div.className = role;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      return div;
    }

    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = input.value.trim();
      if (!msg) return;

      input.value = '';
      send.disabled = true;
      appendMessage('user', msg);
      const reply = appendMessage('assistant', '');

      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: msg, sessionId: 'web' }),
        });

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\\n\\n')) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (!frame.startsWith('data: ')) continue;
            const m = JSON.parse(frame.slice(6));
            if (m.type === 'delta') reply.textContent += m.text;
            else if (m.type === 'error') reply.textContent = 'Error: ' + m.message;
          }
        }
      } catch (err) {
        reply.textContent = 'Connection error: ' + String(err);
      } finally {
        send.disabled = false;
        input.focus();
        log.scrollTop = log.scrollHeight;
      }
    });
  </script>
</body>
</html>`;
