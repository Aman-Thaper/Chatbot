import fs from 'fs/promises';
import fetch from 'node-fetch';

async function getEmbedding(text) {
  const res = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  });
  const data = await res.json();
  return data.embedding;
}

async function reembedFile(inputPath, outputPath, textField) {
  const raw = await fs.readFile(inputPath, 'utf8');
  const arr = JSON.parse(raw);
  for (let i = 0; i < arr.length; ++i) {
    const text = arr[i][textField];
    if (!text) continue;
    arr[i].embedding = await getEmbedding(text);
    if ((i + 1) % 10 === 0 || i === arr.length - 1) {
      console.log(`Re-embedded ${i + 1} / ${arr.length} for ${inputPath}`);
    }
  }
  await fs.writeFile(outputPath, JSON.stringify(arr, null, 2), 'utf8');
  console.log(`Done: ${outputPath}`);
}

async function main() {
  // Policy vectors
  await reembedFile('../data/policy_vectors2.json', '../data/policy_vectors2_ollama.json', 'text');
  // FAQ vectors
  await reembedFile('../data/faq_vectors_emp.json', '../data/faq_vectors_emp_ollama.json', 'question');
  await reembedFile('../data/faq_vectors_mgr.json', '../data/faq_vectors_mgr_ollama.json', 'question');
  await reembedFile('../data/faq_vectors_hr.json', '../data/faq_vectors_hr_ollama.json', 'question');
  // Q&A datasets (add embedding field)
  await reembedFile('../data/qa_dataset_emp.json', '../data/qa_dataset_emp_ollama.json', 'question');
  await reembedFile('../data/qa_dataset_mgr.json', '../data/qa_dataset_mgr_ollama.json', 'question');
  await reembedFile('../data/qa_dataset_hr.json', '../data/qa_dataset_hr_ollama.json', 'question');
}

main().catch(err => {
  console.error('Error during re-embedding:', err);
  process.exit(1);
}); 