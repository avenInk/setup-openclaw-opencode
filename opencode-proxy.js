#!/usr/bin/env node
// OpenCode SDK Proxy — v3.1
// Uses direct HTTP calls to the SDK (bypassing SDK client bugs with `parts`)
// Features: auto-approve permissions, auto-answer questions, reasoning separation,
//           auto-reconnect, chunked streaming, system prompt injection

import os from 'os';
import path from 'path';
import http from 'http';

const { createOpencodeClient } = await import(
  path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', '@opencode-ai', 'sdk', 'dist', 'index.js')
);

// ─── Configuration ──────────────────────────────────────────────────────────
const CONFIG = {
  port: parseInt(process.env.PROXY_PORT || '5200', 10),
  sdkUrl: process.env.SDK_URL || 'http://127.0.0.1:5100',
  bindHost: process.env.BIND_HOST || '127.0.0.1',
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '120000', 10),
  streamChunkSize: parseInt(process.env.STREAM_CHUNK_SIZE || '80', 10),
  streamChunkDelayMs: parseInt(process.env.STREAM_CHUNK_DELAY_MS || '15', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  // Reasoning format: blockquote | details | hidden | inline
  reasoningFormat: process.env.REASONING_FORMAT || 'blockquote',
  // Auto-approve file permissions
  autoApprovePermissions: process.env.AUTO_APPROVE_PERMISSIONS !== 'false',
  // Auto-answer model questions (picks first option)
  autoAnswerQuestions: process.env.AUTO_ANSWER_QUESTIONS !== 'false',
  // Polling interval for permissions/questions
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '500', 10),
  // System prompt to inject (tells model to ask questions as text, not via tool)
  systemPromptInjection: process.env.SYSTEM_PROMPT_INJECTION ||
    'IMPORTANT: If you need to ask the user a question, a preference, or offer options — write it directly as text in your response. NEVER use internal interactive question tools. List options as a numbered list and end with "Please reply with your choice." The user will respond in their next message.',
};

// ─── Logger ─────────────────────────────────────────────────────────────────
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
function log(level, msg) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[CONFIG.logLevel]) {
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'debug' ? '🔍' : 'ℹ️';
    console.log(`[${new Date().toISOString()}] ${prefix} [${level.toUpperCase()}] ${msg}`);
  }
}

// ─── Model Catalog ──────────────────────────────────────────────────────────
const MODEL_CATALOG = [
  { id: 'big-pickle', name: 'Big Pickle', contextWindow: 200000, maxTokens: 64000, input: ['text'], reasoning: true, variants: ['high', 'max'] },
  { id: 'mimo-v2-pro-free', name: 'MiMo V2 Pro Free', contextWindow: 1048576, maxTokens: 32768, input: ['text'], reasoning: false, variants: ['low', 'medium', 'high'] },
  { id: 'mimo-v2-omni-free', name: 'MiMo V2 Omni Free', contextWindow: 262144, maxTokens: 32768, input: ['text', 'image'], reasoning: false, variants: ['low', 'medium', 'high'] },
  { id: 'minimax-m2.5-free', name: 'MiniMax M2.5 Free', contextWindow: 100000, maxTokens: 16384, input: ['text'], reasoning: false, variants: [] },
  { id: 'nemotron-3-super-free', name: 'Nemotron 3 Super Free', contextWindow: 100000, maxTokens: 16384, input: ['text'], reasoning: false, variants: ['low', 'medium', 'high'] },
];

const MODEL_LOOKUP = new Map();
for (const m of MODEL_CATALOG) {
  MODEL_LOOKUP.set(m.id, m);
  for (const v of m.variants) MODEL_LOOKUP.set(`${m.id}:${v}`, m);
}

function buildModelsResponse() {
  const data = [];
  for (const m of MODEL_CATALOG) {
    data.push({ id: `opencode/${m.id}`, name: m.name, context_window: m.contextWindow });
    for (const v of m.variants) {
      const suffix = v.charAt(0).toUpperCase() + v.slice(1);
      data.push({ id: `opencode/${m.id}:${v}`, name: `${m.name} (${suffix})`, context_window: m.contextWindow });
    }
  }
  return JSON.stringify({ data });
}
const MODELS_RESPONSE_JSON = buildModelsResponse();

// ─── Session Manager ────────────────────────────────────────────────────────
const sessions = new Map();
function sessionKey(authKey, modelId, variant) {
  return `${authKey}::${modelId}::${variant || 'default'}`;
}

// ─── SDK Client (for session.create only) ───────────────────────────────────
const sdkClient = createOpencodeClient({ baseUrl: CONFIG.sdkUrl });

// ─── Direct HTTP helpers for SDK ────────────────────────────────────────────
// We use fetch directly because the SDK client has a bug where `parts` is not
// sent in the body for session.prompt (the SDK's buildClientParams drops it).

async function sdkPost(urlPath, body, timeoutMs) {
  const controller = new AbortController();
  const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const resp = await fetch(`${CONFIG.sdkUrl}${urlPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (timeout) clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`SDK ${urlPath} returned ${resp.status}: ${errText}`);
    }
    return await resp.json();
  } catch (err) {
    if (timeout) clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`SDK request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

async function sdkGet(urlPath) {
  const resp = await fetch(`${CONFIG.sdkUrl}${urlPath}`);
  if (!resp.ok) return null;
  return await resp.json();
}

// ─── Permission & Question Auto-Handler ─────────────────────────────────────
let pollerInterval = null;

function startPermissionPoller() {
  log('info', `Permission/Question auto-handler started (poll every ${CONFIG.pollIntervalMs}ms)`);

  pollerInterval = setInterval(async () => {
    try {
      // Auto-approve pending permissions
      if (CONFIG.autoApprovePermissions) {
        const perms = await sdkGet('/permission');
        if (Array.isArray(perms) && perms.length > 0) {
          for (const perm of perms) {
            const id = perm.id;
            if (!id) continue;
            log('info', `Auto-approving permission: ${perm.permission} [${(perm.patterns || []).join(', ')}]`);
            try {
              await sdkPost(`/permission/${id}/reply`, { reply: 'always' });
              log('debug', `Permission ${id} approved ✓`);
            } catch (e) {
              log('warn', `Failed to approve permission ${id}: ${e.message}`);
            }
          }
        }
      }

      // Auto-answer pending questions (or reject them to force text-based questions)
      if (CONFIG.autoAnswerQuestions) {
        const questions = await sdkGet('/question');
        if (Array.isArray(questions) && questions.length > 0) {
          for (const q of questions) {
            const id = q.id;
            if (!id) continue;

            // Reject the question so the model reformulates as text
            // (our system prompt tells it to do this)
            log('info', `Rejecting question "${q.questions?.[0]?.header || 'unknown'}" to force text-based interaction`);
            try {
              await sdkPost(`/question/${id}/reject`, {});
              log('debug', `Question ${id} rejected → model will reformulate as text`);
            } catch (e) {
              log('warn', `Failed to reject question ${id}: ${e.message}`);
              // Try answering as fallback
              try {
                const answers = (q.questions || []).map(qi => {
                  if (qi.options?.length > 0) return [qi.options[0].label];
                  return ['yes'];
                });
                await sdkPost(`/question/${id}/reply`, { answers });
                log('debug', `Question ${id} answered as fallback`);
              } catch { /* ignore */ }
            }
          }
        }
      }
    } catch (err) {
      log('debug', `Poller: ${err.message}`);
    }
  }, CONFIG.pollIntervalMs);
}

function stopPermissionPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseModel(rawModel) {
  let modelId = rawModel.includes('/') ? rawModel.split('/')[1] : rawModel;
  let variant = '';
  if (modelId.includes(':')) {
    const parts = modelId.split(':');
    modelId = parts[0];
    variant = parts[1];
  }
  return { modelId, variant };
}

function buildPromptParts(messages) {
  // Build conversation text & images from non-system messages
  const fileParts = [];
  const textParts = [];
  
  for (const msg of messages) {
    if (msg.role === 'system') continue; // system handled separately
    const role = msg.role || 'user';
    let text = '';
    
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
      
      for (const p of msg.content) {
        if (p.type === 'image_url' && p.image_url && p.image_url.url) {
          const url = p.image_url.url;
          let mime = 'image/jpeg';
          const match = url.match(/^data:([^;]+);base64,/);
          if (match) mime = match[1];
          fileParts.push({ type: 'file', mime: mime, url: url });
        }
      }
    }
    
    if (!text) continue;
    if (role === 'assistant') {
      textParts.push(`[Assistant]\n${text}`);
    } else {
      textParts.push(`[User]\n${text}`);
    }
  }
  
  const finalText = textParts.join('\n\n');
  const finalParts = [{ type: 'text', text: finalText || " " }];
  finalParts.push(...fileParts);
  
  return finalParts;
}

function extractSystemPrompt(messages) {
  return messages
    .filter(m => m.role === 'system')
    .map(m => typeof m.content === 'string' ? m.content : '')
    .filter(Boolean)
    .join('\n');
}

function formatReasoning(text) {
  if (!text) return '';
  switch (CONFIG.reasoningFormat) {
    case 'hidden': return '';
    case 'details': return `<details>\n<summary>💭 Thinking...</summary>\n\n${text}\n\n</details>\n\n`;
    case 'inline': return text + '\n\n';
    case 'blockquote':
    default:
      return `> 💭 *Thinking...*\n${text.split('\n').map(l => `> ${l}`).join('\n')}\n\n`;
  }
}

function extractResponse(data) {
  let textContent = '';
  let reasoningContent = '';
  const tokenUsage = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

  if (data?.info?.tokens) {
    const t = data.info.tokens;
    tokenUsage.input = t.input || 0;
    tokenUsage.output = t.output || 0;
    tokenUsage.reasoning = t.reasoning || 0;
    tokenUsage.cacheRead = t.cache?.read || 0;
    tokenUsage.cacheWrite = t.cache?.write || 0;
    tokenUsage.total = t.total || 0;
  }

  if (data?.parts) {
    for (const part of data.parts) {
      if (part.type === 'text' && part.text) textContent += part.text;
      else if (part.type === 'reasoning' && part.text) reasoningContent += part.text;
    }
  }

  const formatted = formatReasoning(reasoningContent) + textContent;
  return { responseText: formatted, textContent, reasoningContent, tokenUsage };
}

// ─── Session + Prompt with retry ────────────────────────────────────────────
async function getOrCreateSession(authKey, modelId, variant) {
  const sKey = sessionKey(authKey, modelId, variant);
  const cached = sessions.get(sKey);
  if (cached) return { sessionId: cached, sKey, isNew: false };

  // Create session with permissions pre-approved
  const session = await sdkClient.session.create({
    permission: [{ permission: '*', pattern: '**', action: 'allow' }],
  });
  const sessionId = session.data?.id;
  if (!sessionId) throw new Error('Failed to create session');

  sessions.set(sKey, sessionId);
  log('info', `New session: ${sessionId} for ${modelId}${variant ? ':' + variant : ''}`);
  return { sessionId, sKey, isNew: true };
}

async function sendPrompt(authKey, modelId, variant, promptParts, systemPrompt) {
  const maxRetries = 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { sessionId, sKey } = await getOrCreateSession(authKey, modelId, variant);

    try {
      const body = {
        model: { providerID: 'opencode', modelID: modelId },
        parts: promptParts,
      };
      if (variant) body.variant = variant;
      if (systemPrompt) body.system = systemPrompt;

      const data = await sdkPost(
        `/session/${sessionId}/message`,
        body,
        CONFIG.requestTimeoutMs
      );

      return data;

    } catch (err) {
      sessions.delete(sKey);

      if (err.message.includes('timed out')) throw err;

      if (attempt < maxRetries - 1) {
        log('warn', `Prompt failed (attempt ${attempt + 1}), retrying: ${err.message}`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
}

// ─── Streaming ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function writeStreamedResponse(res, responseText, model, tokenUsage) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const chatId = 'chatcmpl-' + Date.now();
  const created = Math.floor(Date.now() / 1000);

  // Role chunk
  res.write(`data: ${JSON.stringify({
    id: chatId, object: 'chat.completion.chunk', created, model,
    choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
  })}\n\n`);

  // Content chunks
  const cs = CONFIG.streamChunkSize;
  for (let i = 0; i < responseText.length; i += cs) {
    res.write(`data: ${JSON.stringify({
      id: chatId, object: 'chat.completion.chunk', created, model,
      choices: [{ index: 0, delta: { content: responseText.slice(i, i + cs) }, finish_reason: null }],
    })}\n\n`);
    if (CONFIG.streamChunkDelayMs > 0) await sleep(CONFIG.streamChunkDelayMs);
  }

  // Finish + usage (before DONE)
  res.write(`data: ${JSON.stringify({
    id: chatId, object: 'chat.completion.chunk', created, model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: tokenUsage.input, completion_tokens: tokenUsage.output, total_tokens: tokenUsage.input + tokenUsage.output },
  })}\n\n`);

  res.write('data: [DONE]\n\n');
  res.end();
}

function buildCompletionResponse(responseText, model, tokenUsage, contextWindow) {
  return {
    id: 'chatcmpl-' + Date.now(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    provider: 'opencode',
    system_fingerprint: null,
    choices: [{
      index: 0, logprobs: null, finish_reason: 'stop',
      message: { role: 'assistant', content: responseText, refusal: null, reasoning: null },
    }],
    usage: {
      prompt_tokens: tokenUsage.input,
      completion_tokens: tokenUsage.output,
      total_tokens: tokenUsage.input + tokenUsage.output,
      cost: 0, is_byok: false,
      prompt_tokens_details: { cached_tokens: tokenUsage.cacheRead, cache_write_tokens: tokenUsage.cacheWrite, audio_tokens: 0, video_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: tokenUsage.reasoning, image_tokens: 0, audio_tokens: 0 },
    },
    context: {
      used: tokenUsage.total || (tokenUsage.input + tokenUsage.output),
      available: contextWindow,
    },
  };
}

// ─── HTTP Server ────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = req.url.replace(/\/$/, '');

  // Health
  if (url === '/health' && req.method === 'GET') {
    let sdkReachable = false;
    try { const r = await fetch(`${CONFIG.sdkUrl}/health`); sdkReachable = r.ok; } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok', version: '3.1', proxy: 'running',
      sdk: sdkReachable ? 'reachable' : 'unreachable',
      uptime: process.uptime(), sessions: sessions.size,
      autoApprove: CONFIG.autoApprovePermissions,
      reasoningFormat: CONFIG.reasoningFormat,
    }));
    return;
  }

  // Models
  if ((url === '/v1/models' || url === '/models') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(MODELS_RESPONSE_JSON);
    return;
  }

  // Chat completions
  if ((url === '/v1/chat/completions' || url === '/chat/completions') && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        let data;
        try { data = JSON.parse(body); } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Invalid JSON', type: 'invalid_request_error' } }));
          return;
        }

        const messages = data.messages;
        if (!Array.isArray(messages) || messages.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: '"messages" must be a non-empty array', type: 'invalid_request_error' } }));
          return;
        }

        const rawModel = data.model || 'big-pickle';
        const { modelId, variant } = parseModel(rawModel);
        const lookupKey = variant ? `${modelId}:${variant}` : modelId;
        const catalogEntry = MODEL_LOOKUP.get(lookupKey);

        if (!catalogEntry) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: `Unknown model "${rawModel}"`, type: 'invalid_request_error' } }));
          return;
        }

        const isStreaming = data.stream === true;

        // Extract system prompt from messages + inject our instruction
        let userSystemPrompt = extractSystemPrompt(messages);
        const fullSystemPrompt = [CONFIG.systemPromptInjection, userSystemPrompt]
          .filter(Boolean).join('\n\n');

        // Build conversational text and extract images from non-system messages
        const promptParts = buildPromptParts(messages);

        log('info', `Request: model=${modelId}${variant ? ':' + variant : ''}, msgs=${messages.length}, stream=${isStreaming}`);

        const authKey = req.headers.authorization || 'default';
        const result = await sendPrompt(authKey, modelId, variant, promptParts, fullSystemPrompt);

        const { responseText, reasoningContent, tokenUsage } = extractResponse(result);
        const finalText = responseText || '[No response from model]';

        log('info', `Response: ${finalText.length}c (reasoning: ${reasoningContent.length}c), tokens: in=${tokenUsage.input} out=${tokenUsage.output}`);

        if (isStreaming) {
          await writeStreamedResponse(res, finalText, rawModel, tokenUsage);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
          res.end(JSON.stringify(buildCompletionResponse(finalText, rawModel, tokenUsage, catalogEntry.contextWindow)));
        }
      } catch (err) {
        log('error', `Error: ${err.message}`);
        if (!res.headersSent) {
          const code = err.message.includes('timed out') ? 504 : 500;
          res.writeHead(code, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: err.message, type: code === 504 ? 'timeout' : 'internal_error' } }));
        }
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'Not found' } }));
});

// ─── Start ──────────────────────────────────────────────────────────────────
server.listen(CONFIG.port, CONFIG.bindHost, () => {
  log('info', `Proxy v3.1 running on http://${CONFIG.bindHost}:${CONFIG.port}`);
  log('info', `SDK: ${CONFIG.sdkUrl} | Timeout: ${CONFIG.requestTimeoutMs}ms`);
  log('info', `Auto-approve: ${CONFIG.autoApprovePermissions} | Reasoning: ${CONFIG.reasoningFormat}`);
  if (CONFIG.autoApprovePermissions || CONFIG.autoAnswerQuestions) startPermissionPoller();
});

// ─── Shutdown ───────────────────────────────────────────────────────────────
function shutdown(sig) {
  log('info', `${sig} received, shutting down...`);
  stopPermissionPoller();
  server.close(() => { log('info', 'Closed'); process.exit(0); });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
