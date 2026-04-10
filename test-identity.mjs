const fs = await import('fs');

async function testIdentity() {
  const models = ['mimo-v2-omni-free', 'big-pickle', 'qwen3.6-plus-free'];

  for (const modelId of models) {
    console.log(`\n\n--- Probando Modelo Solicitado: ${modelId} ---`);
    const payload = {
      model: { providerID: 'opencode', modelID: modelId },
      parts: [{ type: 'text', text: 'Who are you and what specific model are you? Tell me briefly.' }],
      variant: 'high'
    };

    try {
      const sessionRes = await fetch('http://127.0.0.1:5100/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: [{ permission: '*', pattern: '**', action: 'allow' }] })
      });
      const session = await sessionRes.json();
      
      const msgRes = await fetch(`http://127.0.0.1:5100/session/${session.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const bodyText = await msgRes.text();
      if (msgRes.status === 200 && bodyText.length > 0) {
        const json = JSON.parse(bodyText.split('\n')[0]);
        const tp = json.parts?.filter(p => p.type === 'text') || [];
        
        console.log("-> Modelo real reportado por el SDK:", JSON.stringify(json.model || json.info?.model));
        console.log("-> Respuesta:", tp.map(p => p.text).join(' '));
      } else {
        console.log("-> FALLÓ o ESTÁ VACÍO. HTTP Status:", msgRes.status);
      }
    } catch(e) {
      console.log("Exception:", e.message);
    }
  }
}

testIdentity();
