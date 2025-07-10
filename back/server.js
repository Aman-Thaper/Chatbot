// server_os.js (Updated for Ollama only - No Google API)

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import {
  getSectionHierarchyString,
  getSectionLink,
  initializeRoleNames,
  employee_validation,
  loadAllFaqVectors,
  getFaqVectorsForRoles,
  faqVectorsEmp,
  faqVectorsMgr,
  faqVectorsHr
} from './sql_js.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()
const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

let documentChunks = []
let sectionEmbeddings = []
let sectionHierarchy = ''

async function getEmbedding(text) {
  const res = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  });
  const data = await res.json();
  return data.embedding;
}

async function getLLMResponse(messages) {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mistral', messages, options: { temperature: 0.7 } })
  });
  let text = await res.text();
  let content = '';
  try {
    // Split by newlines, filter out empty lines
    const lines = text.split('\n').filter(Boolean);
    for (const line of lines) {
      const obj = JSON.parse(line);
      if (obj.message && obj.message.content) {
        content += obj.message.content;
      }
    }
    return content.trim();
  } catch (err) {
    console.error('Invalid NDJSON from Ollama (first 500 chars):', text.slice(0, 500));
    throw new Error('Ollama API did not return valid NDJSON. See server logs for details.');
  }
}

function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0))
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0))
  if (magA === 0 || magB === 0) return 0
  return dot / (magA * magB)
}

function findRelevantChunks(queryEmbedding, k = 3) {
  const scored = documentChunks.map(chunk => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding)
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

async function loadAndEmbedDocuments() {
  const filePath = path.join(__dirname, '..', 'data', 'policy_vectors2_ollama.json')
  const content = await fs.readFile(filePath, 'utf8')
  documentChunks = JSON.parse(content)
}

async function loadSectionEmbeddings() {
  const sectionNames = sectionHierarchy
    .split('\n')
    .map(line => line.replace(/^- /, '').replace(/\(Only for:.*\)/, '').trim())
    .filter(Boolean)

  sectionEmbeddings = []
  for (const name of sectionNames) {
    const embedding = await getEmbedding(name)
    sectionEmbeddings.push({ name, embedding })
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    policies: documentChunks.length,
    sections: sectionEmbeddings.length
  })
})

app.post('/employee_validator', async (req, res) => {
  const { emp_code } = req.body
  if (!emp_code) return res.status(400).json({ valid: false, error: 'Missing emp_code' })
  const result = await employee_validation(emp_code)
  res.json(result)
})

app.post('/chat', async (req, res) => {
  let { messages, roleIds, BaseUrl } = req.body
  if (!Array.isArray(roleIds)) {
    roleIds = [2, 10, 7] // Default roles if not provided
  }
  const lastMsg = [...messages].reverse().find(m => m.role === 'user')
  const clean = lastMsg?.content.toLowerCase().trim()
  const queryEmbedding = await getEmbedding(clean)

  const faqs = getFaqVectorsForRoles(roleIds)
  const topFaq = faqs
    .map(pair => ({ ...pair, score: cosineSimilarity(queryEmbedding, pair.embedding) }))
    .sort((a, b) => b.score - a.score)[0]

  const relevantChunks = findRelevantChunks(queryEmbedding)

  const sectionScores = sectionEmbeddings
    .map(sec => ({ name: sec.name, score: cosineSimilarity(queryEmbedding, sec.embedding) }))
    .sort((a, b) => b.score - a.score)

  const topSections = sectionScores.slice(0, 3)

  const systemPrompt = `You are the HRMS assistant. Answer from policies and FAQs.\n\nPolicies:\n` +
    relevantChunks.map((c, i) => `Policy ${i + 1}: ${c.text.slice(0, 200)}`).join('\n\n') +
    (topFaq?.score > 0.65 ? `\n\nFAQ:\nQ: ${topFaq.question}\nA: ${topFaq.answer}` : '')

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-2).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ]

  const reply = await getLLMResponse(formattedMessages)

  let sectionLinks = []
  for (const sec of topSections) {
    const url = await getSectionLink(sec.name, roleIds, BaseUrl)
    if (url && !url.includes('not available')) {
      sectionLinks.push(`🔗 [${sec.name}](${url})`)
    }
  }

  res.json({ text: reply + '\n\n📌 Related Sections:\n' + sectionLinks.join('\n') })
})

app.get('/sections', async (req, res) => {
  const roleIds = req.query.roleIds?.split(',').map(Number) || [2, 10, 7]
  const sectionStr = await getSectionHierarchyString(roleIds)
  res.json({ sections: sectionStr })
})

async function startup(roleIds = [2, 10, 7]) {
  await initializeRoleNames()
  sectionHierarchy = await getSectionHierarchyString(roleIds)
  await Promise.all([
    loadAllFaqVectors(),
    loadSectionEmbeddings(),
    loadAndEmbedDocuments()
  ])

  app.listen(port, () => {
    console.log(`🚀 Open-source HRMS chatbot running at http://localhost:${port}`)
  })
}

startup().catch(err => {
  console.error('Startup failed:', err)
  process.exit(1)
})
