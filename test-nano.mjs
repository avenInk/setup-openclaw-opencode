const fs = await import('fs');

async function testNano() {
  const payload = {
    model: { providerID: 'opencode', modelID: 'gpt-5-nano' },
    parts: [{ type: 'text', text: 'Hello' }]
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
    console.log("Status:", msgRes.status);
    console.log("Body:", bodyText);
  } catch(e) {
    console.log("Exception:", e.message);
  }
}

testNano();
