const fs = await import('fs');

async function check() {
  const payload = {
    model: { providerID: 'opencode', modelID: 'qwen3.6-plus-free' },
    parts: [{ type: 'text', text: 'Hello' }, { type: 'file', mime: 'image/jpeg', url: 'data:image/jpeg;base64,' + Buffer.from('fake image').toString('base64') }],
    variant: 'high'
  };

  const c = await fetch('http://127.0.0.1:5100/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission: [{ permission: '*', pattern: '**', action: 'allow' }] })
  });
  const ses = await c.json();

  const msg = await fetch(`http://127.0.0.1:5100/session/${ses.id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const bodyText = await msg.text();
  console.log("TEXT MSG STATUS: ", msg.status, "BODY LEN:", bodyText.length);
  if (msg.status !== 200 || bodyText.length === 0) {
    console.log("TEXT ERROR:", bodyText);
  } else {
    console.log("Response starts with:", bodyText.substring(0, 100));
  }
}

check();
