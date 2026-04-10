const fs = await import('fs');

async function testQwenImage() {
  // Let's create a red 1x1 image properly
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAAANSURBVBhXY3jP4PgfAAWgA4EEMX5XAAAAAElFTkSuQmCC';

  const payloadDataUrl = {
    model: { providerID: 'opencode', modelID: 'qwen3.6-plus-free' },
    parts: [
      { type: 'text', text: 'What is the exact color of the single pixel in the attached image?' },
      { type: 'file', mime: 'image/png', url: 'data:image/png;base64,' + b64 }
    ]
  };

  const payloadFileUrl = {
    model: { providerID: 'opencode', modelID: 'qwen3.6-plus-free' },
    parts: [
      { type: 'text', text: 'What is the exact color of the single pixel in the attached image?' },
      { type: 'file', mime: 'image/png', url: 'file:///tmp/red.png' }
    ]
  };

  fs.writeFileSync('/tmp/red.png', Buffer.from(b64, 'base64'));

  for (const [name, payload] of Object.entries({ dataUrl: payloadDataUrl, fileUrl: payloadFileUrl })) {
    console.log(`\nTesting ${name}...`);
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
    if (msgRes.status !== 200) {
      console.log("ERROR:", bodyText);
    } else {
      try {
        const json = JSON.parse(bodyText.split('\n')[0]);
        console.log("RESPONSE:", json.info?.parentID ? "(Valid response shape)" : json);
        
        // Find text parts
        const textParts = json.parts?.filter(p => p.type === 'text') || [];
        console.log("Content:", textParts.map(p => p.text).join(' '));
      } catch (e) {
        console.log("BAD JSON:", bodyText.substring(0,100));
      }
    }
  }
}

testQwenImage();
