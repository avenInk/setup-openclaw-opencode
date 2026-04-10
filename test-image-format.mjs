const fs = await import('fs');

async function testImageFormat() {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAAANSURBVBhXY3jP4PgfAAWgA4EEMX5XAAAAAElFTkSuQmCC';
  
  // Try sending 'image_url' instead of 'file' natively to SDK
  const payloadImageURL = {
    model: { providerID: 'opencode', modelID: 'mimo-v2-omni-free' },
    parts: [
      { type: 'text', text: 'Analyze this image and describe the color of the pixel.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } }
    ],
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
      body: JSON.stringify(payloadImageURL)
    });
    
    const bodyText = await msgRes.text();
    console.log("STATUS:", msgRes.status, "LEN:", bodyText.length);
    if (msgRes.status === 200 && bodyText.length > 0) {
      const json = JSON.parse(bodyText.split('\n')[0]);
      const tp = json.parts?.filter(p => p.type === 'text') || [];
      console.log("Content:", tp.map(p => p.text).join(' '));
    } else {
      console.log("ERROR BODY:", bodyText);
    }
  } catch(e) {
    console.log("Exception:", e.message);
  }
}

testImageFormat();
