#!/usr/bin/env node
// Proxy para OpenCode SDK - Version con soporte streaming

import { createOpencodeClient } from '/home/d0098/.npm-global/lib/node_modules/@opencode-ai/sdk/dist/index.js';
import http from 'http';

const PORT = 5200;
const SDK_URL = 'http://127.0.0.1:5100';

const sessions = new Map();

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url.replace(/\/$/, '');

  // Models endpoint
  if ((url === '/v1/models' || url === '/models') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: [
        // Big Pickle variants
        { id: 'opencode/big-pickle', name: 'Big Pickle', context_window: 200000 },
        { id: 'opencode/big-pickle:high', name: 'Big Pickle (High)', context_window: 200000 },
        { id: 'opencode/big-pickle:max', name: 'Big Pickle (Max)', context_window: 200000 },
        // MiMo V2 Pro variants
        { id: 'opencode/mimo-v2-pro-free', name: 'MiMo V2 Pro Free', context_window: 1048576 },
        { id: 'opencode/mimo-v2-pro-free:low', name: 'MiMo V2 Pro Free (Low)', context_window: 1048576 },
        { id: 'opencode/mimo-v2-pro-free:medium', name: 'MiMo V2 Pro Free (Medium)', context_window: 1048576 },
        { id: 'opencode/mimo-v2-pro-free:high', name: 'MiMo V2 Pro Free (High)', context_window: 1048576 },
        // MiMo V2 Omni variants
        { id: 'opencode/mimo-v2-omni-free', name: 'MiMo V2 Omni Free', context_window: 262144 },
        { id: 'opencode/mimo-v2-omni-free:low', name: 'MiMo V2 Omni Free (Low)', context_window: 262144 },
        { id: 'opencode/mimo-v2-omni-free:medium', name: 'MiMo V2 Omni Free (Medium)', context_window: 262144 },
        { id: 'opencode/mimo-v2-omni-free:high', name: 'MiMo V2 Omni Free (High)', context_window: 262144 },
        // MiniMax (no variants)
        { id: 'opencode/minimax-m2.5-free', name: 'MiniMax M2.5 Free', context_window: 100000 },
        // Nemotron variants
        { id: 'opencode/nemotron-3-super-free', name: 'Nemotron 3 Super Free', context_window: 100000 },
        { id: 'opencode/nemotron-3-super-free:low', name: 'Nemotron 3 Super Free (Low)', context_window: 100000 },
        { id: 'opencode/nemotron-3-super-free:medium', name: 'Nemotron 3 Super Free (Medium)', context_window: 100000 },
        { id: 'opencode/nemotron-3-super-free:high', name: 'Nemotron 3 Super Free (High)', context_window: 100000 }
      ]
    }));
    return;
  }

  // Chat completions endpoint
  if ((url === '/v1/chat/completions' || url === '/chat/completions') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const model = data.model || 'big-pickle';
        
        // Extraer variant del modelo (ej: opencode/big-pickle:high -> modelId: big-pickle, variant: high)
        let modelId = model.includes('/') ? model.split('/')[1] : model;
        let modelVariant = '';
        
        if (modelId.includes(':')) {
          const parts = modelId.split(':');
          modelId = parts[0];
          modelVariant = parts[1];
        }
        
        const isStreaming = data.stream === true;
        
        // Extraer el prompt
        let prompt = '';
        const messages = data.messages || [];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage) {
          if (typeof lastMessage.content === 'string') {
            prompt = lastMessage.content;
          } else if (Array.isArray(lastMessage.content)) {
            for (const part of lastMessage.content) {
              if (part.type === 'text') {
                prompt = part.text;
                break;
              }
            }
          }
        }

        log(`Model: ${modelId}, Stream: ${isStreaming}, Prompt: ${prompt.substring(0, 30)}`);

        // Obtener o crear sesión
        const authKey = req.headers.authorization || 'default';
        let sessionId = sessions.get(authKey);

        if (!sessionId) {
          const client = createOpencodeClient({ baseUrl: SDK_URL });
          const sessionConfig = { model: modelId };
          if (modelVariant) {
            sessionConfig.variant = modelVariant;
          }
          const session = await client.session.create({
            body: { config: sessionConfig }
          });
          sessionId = session.data?.id;
          sessions.set(authKey, sessionId);
          log(`Session: ${sessionId}, Variant: ${modelVariant || 'default'}`);
        }

        // Enviar prompt
        const client = createOpencodeClient({ baseUrl: SDK_URL });
        const modelConfig = { providerID: 'opencode', modelID: modelId };
        if (modelVariant) {
          modelConfig.variant = modelVariant;
        }
        const result = await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: modelConfig,
            parts: [{ type: 'text', text: prompt }]
          }
        });

        // Extraer respuesta
        let responseText = '';
        let tokenUsage = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
        let contextUsed = 0;
        
        // Extraer de info
        if (result.data?.info?.tokens) {
          tokenUsage = {
            input: result.data.info.tokens.input || 0,
            output: result.data.info.tokens.output || 0,
            reasoning: result.data.info.tokens.reasoning || 0,
            cacheRead: result.data.info.tokens.cache?.read || 0,
            cacheWrite: result.data.info.tokens.cache?.write || 0,
            total: result.data.info.tokens.total || 0
          };
          // Usar total como contexto usado
          contextUsed = tokenUsage.total;
        }
        
        // Extraer texto de parts
        if (result.data?.parts) {
          for (const part of result.data.parts) {
            if (part.type === 'text' && part.text) {
              responseText = part.text;
            }
          }
        }

        log(`Response: ${responseText.substring(0, 30)}, tokens: ${tokenUsage.total}`);

        if (isStreaming) {
          // Streaming response (SSE)
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
          });
          
          // Send the content delta
          res.write(`data: ${JSON.stringify({
            id: 'chatcmpl-' + Date.now(),
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{
              index: 0,
              delta: { content: responseText, role: 'assistant' },
              finish_reason: null
            }]
          })}\n\n`);
          
          // Send the finish
          res.write(`data: ${JSON.stringify({
            id: 'chatcmpl-' + Date.now(),
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: 'stop'
            }]
          })}\n\n`);
          
          res.write('data: [DONE]\n\n');
          
          // Send usage info as a separate message
          res.write(`data: ${JSON.stringify({
            type: 'usage',
            usage: {
              prompt_tokens: tokenUsage.input,
              completion_tokens: tokenUsage.output,
              total_tokens: tokenUsage.input + tokenUsage.output
            }
          })}\n\n`);
          
          res.end();
          log('Streaming response sent');
        } else {
          // Non-streaming response
          const response = {
            id: 'chatcmpl-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            provider: 'opencode',
            system_fingerprint: null,
            choices: [{
              index: 0,
              logprobs: null,
              finish_reason: 'stop',
              message: { 
                role: 'assistant', 
                content: responseText,
                refusal: null,
                reasoning: null
              }
            }],
            usage: { 
              prompt_tokens: tokenUsage.input, 
              completion_tokens: tokenUsage.output, 
              total_tokens: tokenUsage.input + tokenUsage.output,
              cost: 0,
              is_byok: false,
              prompt_tokens_details: {
                cached_tokens: tokenUsage.cacheRead,
                cache_write_tokens: tokenUsage.cacheWrite,
                audio_tokens: 0,
                video_tokens: 0
              },
              completion_tokens_details: {
                reasoning_tokens: tokenUsage.reasoning,
                image_tokens: 0,
                audio_tokens: 0
              }
            },
            context: {
              used: contextUsed,
              available: 200000
            }
          };

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'X-Request-ID': 'req-' + Date.now(),
            'Cache-Control': 'no-cache'
          });
          res.end(JSON.stringify(response));
          log('Response sent');
        }
      } catch (err) {
        log(`ERROR: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  log(`Proxy running on http://127.0.0.1:${PORT}`);
  log(`SDK URL: ${SDK_URL}`);
});
