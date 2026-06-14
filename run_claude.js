const https = require('https');
const fs = require('fs');

const systemPrompt = `You are the autonomous maintainer of the
data-center IT knowledge base and office simulation project.
Work completely autonomously.
ALWAYS start by reading: CLAUDE.md, TOKEN-BUDGET.md.
ALWAYS run Hebrew/English RTL audit on index.html.
Respect all rules in CLAUDE.md "Launch Decisions".
Cost guards: $5 Claude API cap, use Groq for agents,
Gemini for reports only. Output ONLY file changes as JSON:
{"files":[{"path":"...","content":"..."}],
 "commit_message":"...","summary":"..."}`;

const task = process.env.TASK || 'Read TOKEN-BUDGET.md and execute the next queued task.';

const body = JSON.stringify({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  system: systemPrompt,
  messages: [{role: 'user', content:
    `Session type: ${process.env.SESSION_TYPE}\n` +
    `Task: ${task}\n\n` +
    `Current TOKEN-BUDGET.md:\n` +
    fs.readFileSync('TOKEN-BUDGET.md', 'utf8') + '\n\n' +
    `Current CLAUDE.md summary:\n` +
    fs.readFileSync('CLAUDE.md', 'utf8').slice(0, 3000)
  }]
});

const req = https.request({
  hostname: 'api.anthropic.com',
  path: '/v1/messages',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      const text = response.content[0].text;
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start === -1) {
        fs.writeFileSync('claude_summary.txt', text);
        console.log('No file changes — summary saved');
        return;
      }
      const result = JSON.parse(text.slice(start, end));
      result.files.forEach(f => {
        const dir = f.path.split('/').slice(0,-1).join('/');
        if (dir) fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(f.path, f.content);
        console.log('Written:', f.path);
      });
      fs.writeFileSync('claude_result.json', JSON.stringify({
        commit_message: result.commit_message,
        summary: result.summary
      }));
    } catch(e) {
      console.error('Parse error:', e.message);
      fs.writeFileSync('claude_error.txt', data);
    }
  });
});
req.on('error', e => { console.error(e); process.exit(1); });
req.write(body);
req.end();
