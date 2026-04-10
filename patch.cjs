const fs = require('fs');

async function updateEverything() {
  // 1. Update openclaw.json
  const confPath = '/home/d0098/.openclaw/setup-openclaw-opencode/openclaw.json';
  const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
  
  const keepModels = ['big-pickle', 'nemotron-3-super-free', 'minimax-m2.5-free'];
  
  // Filter out mimo
  conf.models.providers.opencode.models = conf.models.providers.opencode.models.filter(m => 
    !m.id.includes('mimo-v2') 
  );
  
  // Add qwen and gpt-5-nano
  conf.models.providers.opencode.models.push({
    "id": "opencode/qwen3.6-plus-free",
    "name": "Qwen3.6 Plus Free",
    "api": "openai-completions",
    "reasoning": false,
    "input": ["text"],
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 131072,
    "maxTokens": 16384
  });
  
  conf.models.providers.opencode.models.push({
    "id": "opencode/gpt-5-nano",
    "name": "GPT-5 Nano",
    "api": "openai-completions",
    "reasoning": false,
    "input": ["text"],
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 128000,
    "maxTokens": 16384
  });

  // Clean agents.defaults.models
  const newAliases = {};
  for (const [key, val] of Object.entries(conf.agents.defaults.models)) {
    if (!key.includes('mimo-v2')) {
      newAliases[key] = val;
    }
  }
  newAliases['opencode/qwen3.6-plus-free'] = { alias: "Qwen3.6 Plus Free" };
  newAliases['opencode/gpt-5-nano'] = { alias: "GPT-5 Nano" };
  
  conf.agents.defaults.models = newAliases;
  
  fs.writeFileSync(confPath, JSON.stringify(conf, null, 2));

  // 2. Update opencode-proxy.js
  const proxyPath = '/home/d0098/.openclaw/setup-openclaw-opencode/opencode-proxy.js';
  let proxy = fs.readFileSync(proxyPath, 'utf8');
  
  // Replace MODEL_CATALOG
  const catalogRegex = /const MODEL_CATALOG = \[[^\]]*\];/s;
  const newCatalog = `const MODEL_CATALOG = [
  { id: 'big-pickle', name: 'Big Pickle', contextWindow: 200000, maxTokens: 64000, input: ['text'], reasoning: true, variants: ['high', 'max'] },
  { id: 'qwen3.6-plus-free', name: 'Qwen3.6 Plus Free', contextWindow: 131072, maxTokens: 16384, input: ['text'], reasoning: false, variants: [] },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', contextWindow: 128000, maxTokens: 16384, input: ['text'], reasoning: false, variants: [] },
  { id: 'minimax-m2.5-free', name: 'MiniMax M2.5 Free', contextWindow: 100000, maxTokens: 16384, input: ['text'], reasoning: false, variants: [] },
  { id: 'nemotron-3-super-free', name: 'Nemotron 3 Super Free', contextWindow: 100000, maxTokens: 16384, input: ['text'], reasoning: false, variants: ['low', 'medium', 'high'] },
];`;

  proxy = proxy.replace(catalogRegex, newCatalog);
  
  // Remove the image hijack polyfill since it's no longer needed (we disabled image inputs)
  const hijackRegex = /^\s*\/\/\s*Polyfill missing image models.*?\n\n/sm;
  proxy = proxy.replace(hijackRegex, '');
  proxy = proxy.replace(/actualModelId/g, 'modelId');
  proxy = proxy.replace(/const hasImage = promptParts[^\n]+\n\s+if \(hasImage[^}]+}\s+/, '');
  
  fs.writeFileSync(proxyPath, proxy);
  
  // 3. Copy files to production
  fs.copyFileSync(confPath, '/home/d0098/.openclaw/openclaw.json');
  fs.copyFileSync(proxyPath, '/home/d0098/.openclaw/opencode-proxy.js');
  
  console.log("Updated everything");
}

updateEverything();
