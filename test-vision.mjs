const fs = await import('fs');

async function testModels() {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAAANSURBVBhXY3jP4PgfAAWgA4EEMX5XAAAAAElFTkSuQmCC';
  const models = ['qwen3.6-plus-free', 'gpt-5-nano', 'nemotron-3-super-free', 'minimax-m2.5-free'];

  for (const modelId of models) {
    console.log(`\nTesting ${modelId}...`);
    const payloadDataUrl = {
      model: { providerID: 'opencode', modelID: modelId },
      parts: [
        { type: 'text', text: 'Analyze this image and describe the color of the pixel.' },
        { type: 'file', mime: 'image/png', url: 'data:image/png;base64,' + b64 }
      ]
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
        body: JSON.stringify(payloadDataUrl)
      });
      
      const bodyText = await msgRes.text();
      if (msgRes.status === 200) {
        if (bodyText.length === 0) { console.log('EMPTY RESPONSE'); continue; }
        const json = JSON.parse(bodyText.split('\n')[0]);
        const tp = json.parts?.filter(p => p.type === 'text') || [];
        console.log("Content:", tp.map(p => p.text).join(' ').substring(0, 80));
      } else {
        console.log("ERROR STATUS:", msgRes.status);
      }
    } catch(e) {
      console.log("Exception:", e.message);
    }
  }
}

testModels();
