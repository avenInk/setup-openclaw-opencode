const fs = await import('fs');

async function testPermutations() {
  const models = [
    { modelID: 'mimo-v2-omni-free', variant: 'high' },
    { modelID: 'mimo-v2-omni-free:high' }, 
    { modelID: 'mimo-v2-pro-free' }
  ];

  for (const m of models) {
    console.log(`\n\n--- Probando Permutación: ${JSON.stringify(m)} ---`);
    const payload = {
      model: { providerID: 'opencode', modelID: m.modelID },
      parts: [{ type: 'text', text: 'Who are you and what specific model are you?' }]
    };
    if (m.variant) payload.variant = m.variant;

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
        console.log("-> Respuesta:", tp.map(p => p.text).join(' '));
      } else {
        console.log(`-> FALLÓ o ESTÁ VACÍO. HTTP Status: ${msgRes.status}, Body Length: ${bodyText.length}`);
      }
    } catch(e) {
      console.log("Exception:", e.message);
    }
  }
}

testPermutations();
