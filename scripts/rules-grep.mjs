// Reads the official hackathon rules page and prints sentences about third-party tools and Meta model use.
const res = await fetch("https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver", { headers: { "user-agent": "Mozilla/5.0" } });
const html = await res.text();
const texts = [...html.matchAll(/\\"text\\":\\"(.*?)\\"[,}]/g)].map((m) => m[1].replace(/\\\\u0026/g, "&")).join(" ");
const sentences = texts.split(/(?<=[.!?])\s+/);
const keys = /third[- ]party|open[- ]source|meaningful|assistant|AI tool|generative|use of (the )?meta|Meta (Model|AI|API)|originality|original work|created during/i;
const hits = sentences.filter((s) => keys.test(s)).map((s) => s.slice(0, 450));
console.log(`page chars: ${html.length}, text chars: ${texts.length}, hits: ${hits.length}\n`);
console.log([...new Set(hits)].slice(0, 16).join("\n---\n"));
