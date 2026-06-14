/* Runbook Terminal Demo — vanilla JS port of the React TerminalDemo component
 * (agents/assets/incoming/datacenter-runbook-optimized/.../TerminalDemo-BKImi6bs.js).
 * Plays a scripted "live case execution" terminal session: each command is
 * typed, its output streams line-by-line, then a status line confirms the
 * check passed. Dependency-free — uses the app's existing CSS variables.
 */
(function (global) {
  'use strict';

  const STEPS = [
    {
      input: 'ping -c 4 192.168.1.1',
      outputs: [
        'PING 192.168.1.1 (192.168.1.1): 56 data bytes',
        '64 bytes from 192.168.1.1: icmp_seq=0 ttl=64 time=2.341 ms',
        '64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=1.987 ms',
        '64 bytes from 192.168.1.1: icmp_seq=2 ttl=64 time=2.156 ms',
        '64 bytes from 192.168.1.1: icmp_seq=3 ttl=64 time=2.089 ms',
        '--- 192.168.1.1 statistics ---',
        '4 packets transmitted, 4 packets received, 0.0% packet loss',
        'round-trip min/avg/max/stddev = 1.987/2.143/2.341/0.137 ms'
      ],
      status: '✓ Host reachable',
      statusClass: 'rb-ok'
    },
    {
      input: 'systemctl status nginx',
      outputs: [
        '● nginx.service - A high performance web server and a reverse proxy server',
        '   Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)',
        '   Active: active (running) since Thu 2026-06-12 16:35:22 UTC; 2 days ago',
        '  Process: 1234 ExecStart=/usr/sbin/nginx -g daemon off; (code=exited, status=0/SUCCESS)',
        ' Main PID: 1235 (nginx)',
        '    Tasks: 5 (limit: 4915)',
        '   Memory: 12.5M',
        '   CGroup: /system.slice/nginx.service'
      ],
      status: '✓ Service running',
      statusClass: 'rb-ok'
    },
    {
      input: 'df -h /var/log',
      outputs: [
        'Filesystem      Size  Used Avail Use% Mounted on',
        '/dev/sda2       100G   45G   55G  45% /',
        '',
        'Log directory status: OK'
      ],
      status: '✓ Disk space adequate',
      statusClass: 'rb-ok'
    }
  ];

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
      .rb-terminal-demo { display: flex; flex-direction: column; gap: 12px; }
      .rb-terminal-demo .rb-controls { display: flex; gap: 10px; flex-wrap: wrap; }
      .rb-terminal-demo button {
        font-family: var(--sans); font-size: 0.85rem; font-weight: 600;
        padding: 8px 16px; border-radius: 8px; cursor: pointer;
        border: 1px solid var(--border2); background: var(--surface2); color: var(--text);
        transition: border-color 0.2s, color 0.2s;
      }
      .rb-terminal-demo button.rb-run { border-color: var(--accent2); color: var(--accent2); }
      .rb-terminal-demo button.rb-run:disabled { opacity: 0.5; cursor: default; }
      .rb-terminal-demo button.rb-copy:hover { border-color: var(--accent); color: var(--accent); }
      .rb-terminal-demo .rb-screen {
        background: #05080c; border: 1px solid var(--border); border-radius: var(--card-radius);
        padding: 14px; font-family: var(--mono); font-size: 0.8rem; line-height: 1.5;
        height: 320px; overflow-y: auto; direction: ltr; text-align: left;
      }
      .rb-terminal-demo .rb-line { white-space: pre-wrap; word-break: break-all; }
      .rb-terminal-demo .rb-cmd { color: var(--accent2); }
      .rb-terminal-demo .rb-out { color: var(--accent-dim); }
      .rb-terminal-demo .rb-ok { color: var(--accent); font-weight: 600; }
      .rb-terminal-demo .rb-cursor { color: var(--accent2); animation: rb-blink 1s steps(2) infinite; }
      @keyframes rb-blink { 50% { opacity: 0; } }
      .rb-terminal-demo .rb-note {
        font-size: 0.8rem; color: var(--text-muted); border: 1px solid var(--accent2-soft);
        background: var(--accent2-soft); border-radius: var(--card-radius); padding: 10px 12px;
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // mount(container, opts?) — opts.noteHe / opts.noteEn for the caption text.
  function mount(container, opts) {
    opts = opts || {};
    injectStyles();
    container.innerHTML = '';
    container.className = (container.className ? container.className + ' ' : '') + 'rb-terminal-demo';

    const controls = document.createElement('div');
    controls.className = 'rb-controls';

    const runBtn = document.createElement('button');
    runBtn.className = 'rb-run';
    runBtn.textContent = opts.runLabel || '▶ Run Demo';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'rb-copy';
    copyBtn.textContent = opts.copyLabel || '⧉ Copy Commands';

    controls.appendChild(runBtn);
    controls.appendChild(copyBtn);

    const screen = document.createElement('div');
    screen.className = 'rb-screen';

    const note = document.createElement('div');
    note.className = 'rb-note';
    note.textContent = opts.note || 'Demo: simulates the Live Case Execution Engine running a troubleshooting checklist.';

    container.appendChild(controls);
    container.appendChild(screen);
    container.appendChild(note);

    function addLine(text, cls) {
      const line = document.createElement('div');
      line.className = 'rb-line' + (cls ? ' ' + cls : '');
      line.textContent = text;
      screen.appendChild(line);
      screen.scrollTop = screen.scrollHeight;
      return line;
    }

    let running = false;
    async function runDemo() {
      if (running) return;
      running = true;
      runBtn.disabled = true;
      runBtn.textContent = opts.runningLabel || 'Running...';
      screen.innerHTML = '';
      addLine('$ Initializing test environment...', 'rb-cmd');
      await sleep(500);
      for (const step of STEPS) {
        addLine('$ ' + step.input, 'rb-cmd');
        await sleep(300);
        for (const out of step.outputs) {
          addLine(out, 'rb-out');
          await sleep(100);
        }
        addLine(step.status, step.statusClass);
        await sleep(400);
      }
      addLine('✓ All checks passed. Ready for production.', 'rb-ok');
      runBtn.disabled = false;
      runBtn.textContent = opts.runLabel || '▶ Run Demo';
      running = false;
    }

    runBtn.addEventListener('click', runDemo);
    copyBtn.addEventListener('click', () => {
      const text = STEPS.map(s => s.input).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        const original = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = original; }, 2000);
      });
    });

    return { run: runDemo };
  }

  global.RunbookTerminalDemo = { mount, STEPS };
})(typeof window !== 'undefined' ? window : globalThis);
