import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { fileURLToPath } from 'url'
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
import Fuse from 'fuse.js';


const START_TIME = new Date();
const VERSION = process.env.npm_package_version || '1.0.0';
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app = express()
const port = process.env.PORT || 3000
const env = process.env.NODE_ENV || 'development';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
const embeddingModel = genAI.getGenerativeModel({ model: 'embedding-001' })

app.use(cors())
app.use(express.json())

function chunkText(text, maxWords = 300) {
  const words = text.split(/\s+/)
  const chunks = []
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '))
  }
  return chunks
}

let documentChunks = []
let qaPairs = []
let sectionHierarchy = null
let sectionEmbeddings = []

async function loadAndEmbedDocuments() {
  try {
    documentChunks = [];
    const filePath = path.join(__dirname, '..', 'data', 'policy_vectors2.json');
    const fileContent = await fs.readFile(filePath, 'utf8');
    documentChunks = JSON.parse(fileContent);
    console.log(`✅ Loaded ${documentChunks.length} policy chunks with embeddings from policy_vectors2.json`);
  } catch (err) {
    console.error('❌ Failed to load policy vectors from policy_vectors2.json:', err.message);
    documentChunks = [];
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
  const scoredChunks = documentChunks.map(chunk => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding)
  }))
  scoredChunks.sort((a, b) => b.score - a.score)
  return scoredChunks.slice(0, k)
}

async function loadSectionEmbeddings() {
  try {
    const sectionNames = sectionHierarchy
      .split('\n')
      .map(line => line.replace(/^- /, '').replace(/\(Only for:.*\)/, '').trim())
      .filter(Boolean)

    sectionEmbeddings = []
    for (const name of sectionNames) {
      const embedResp = await embeddingModel.embedContent(name)
      sectionEmbeddings.push({ name, embedding: embedResp.embedding.values })
    }

    console.log('✅ Fresh section embeddings created:', sectionEmbeddings.length)
  } catch (err) {
    console.error('❌ Failed to generate section embeddings:', err.message)
    sectionEmbeddings = []
  }
}

app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    version: VERSION,
    uptime: process.uptime(),
    services: {
      databases: {
        policies: documentChunks.length,
        faqs: {
          employee: faqVectorsEmp.length,
          manager: faqVectorsMgr.length,
          hr: faqVectorsHr.length
        },
        sections: sectionEmbeddings.length
      },
      ai: {
        gemini: 'connected'
      }
    }
  };

  // Critical failures
  const isUnhealthy = documentChunks.length === 0 || sectionEmbeddings.length === 0;

  // Non-critical warnings
  const emptyFaqs = [faqVectorsEmp, faqVectorsMgr, faqVectorsHr].filter(arr => arr.length === 0);

  if (isUnhealthy) {
    healthCheck.status = 'unhealthy';
  } else if (emptyFaqs.length > 0) {
    healthCheck.status = 'degraded';
    healthCheck.warning = `${emptyFaqs.length} FAQ sets empty (${emptyFaqs.join(', ')})`;
  }

  res.json(healthCheck);
});

// Add this simple status endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Talenticks HRM API',
    version: VERSION,
    status: 'operational',
    documentation: '/health for system status'
  });
});
// Add Employee Validator endpoint before /chat
app.post('/employee_validator', async (req, res) => {
  try {
    const { emp_code } = req.body;
    if (!emp_code) {
      return res.status(400).json({ valid: false, error: 'Missing emp_code' });
    }

    const validationResult = await employee_validation(emp_code);
    res.json(validationResult);
  } catch (err) {
    console.error('❌ Error in /employee_validator:', err.message);
    res.status(500).json({ valid: false, error: 'Internal server error' });
  }
});

// Chat Endpoint
app.post('/chat', async (req, res) => {
  try {
    let { messages, roleIds,BaseUrl } = req.body;

    // Normalize roleIds to an array of numbers
    if (typeof roleIds === 'string') {
      roleIds = roleIds.split(',').map(Number);
    } else if (Array.isArray(roleIds)) {
      roleIds = roleIds.map(Number);
    } else {
      // Fallback in case something unexpected comes in
      roleIds = [2, 10, 7];
    }
    // 

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMsg) return res.status(400).json({ text: 'No user message found.' })

    const cleanUserQuestion = lastUserMsg.content.toLowerCase().trim()
    const queryEmbedding = (await embeddingModel.embedContent(cleanUserQuestion)).embedding.values

    // Use the correct FAQ vectors for the current roleIds
    const faqsToUse = getFaqVectorsForRoles(roleIds);
    console.log(faqsToUse)
    const qaScored = faqsToUse.map(pair => ({
      ...pair,
      score: cosineSimilarity(queryEmbedding, pair.embedding)
    }));
    qaScored.sort((a, b) => b.score - a.score)

    const topQAMatch = qaScored[0]?.score > 0.65 ? qaScored[0] : null
    const relevantChunks = findRelevantChunks(queryEmbedding, 3)

    const sectionScores = sectionEmbeddings.map(sec => ({
      name: sec.name,
      score: cosineSimilarity(queryEmbedding, sec.embedding)
    }))

    sectionScores.sort((a, b) => b.score - a.score)
    console.log('📊 Top Section Scores:', sectionScores.slice(0, 10))

    const relevantSections = sectionScores.filter(sec => sec.score >= 0.85).slice(0, 5)

    const systemPromptContent = `
You are an AI assistant for the Talenticks HRM platform.
Answer based on the company policies and FAQs. If the answer is not available, reply honestly.
Always prioritize matching Q&A if available.
If the threshold is crossed just use the answer from FAQ instead of trying to answer from context. Don't try too hard if the answer is already found from policies or FAQ.


📚 Section Hierarchy:
${sectionHierarchy}

📄 Policies:
${relevantChunks.map((c, i) => `Policy chunk ${i + 1} (from ${c.sourceFile}):\n${c.text}`).join('\n\n')}

${topQAMatch ? `💡 Matching Q&A:\nQ: ${topQAMatch.question}\nA: ${topQAMatch.answer}` : ''}`.trim()

    const lastThreeMessages = messages.slice(-3).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }))

    let history = []

    if (lastThreeMessages.length > 0) {
      if (lastThreeMessages[0].role !== 'user') {
        lastThreeMessages.unshift({
          role: 'user',
          parts: [{ text: systemPromptContent }]
        })
      } else {
        lastThreeMessages[0].parts[0].text =
          systemPromptContent + '\n\n' + lastThreeMessages[0].parts[0].text
      }
      history = lastThreeMessages.slice(0, -1)
    }

    const chat = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.7
      }
    })

    const chatResponse = await chat.sendMessage(
      lastThreeMessages[lastThreeMessages.length - 1].parts[0].text
    )

    let aiReply = chatResponse.response.text()

    // --- Fuzzy matching for section names in aiReply ---
    const allSectionNames = sectionEmbeddings.map(sec => sec.name);
    const fuse = new Fuse(allSectionNames, {
      includeScore: true,
      threshold: 0.2, // Lower = stricter, higher = fuzzier
    });
    const referencedSections = new Set();
    // Try matching all possible n-grams up to 4 words
    const aiWords = aiReply.split(/\s+/);
    for (let n = 4; n >= 1; n--) {
      for (let i = 0; i <= aiWords.length - n; i++) {
        const phrase = aiWords.slice(i, i + n).join(' ');
        const results = fuse.search(phrase);
        if (results.length > 0 && results[0].score < 0.4) {
          referencedSections.add(results[0].item);
        }
      }
    }

    let sectionLinks = new Map();
    if (referencedSections.size > 0) {
      for (const sectionName of referencedSections) {
        const url = await getSectionLink(sectionName, roleIds);
        if (url && !url.includes('not available to your role')) {
          sectionLinks.set(sectionName, url);
        }
      }
    } else {
      // Fallback: use section embedding on the user's question
      for (const section of relevantSections) {
        const url = await getSectionLink(section.name, roleIds);
        if (url && !url.includes('not available to your role')) {
          sectionLinks.set(section.name, url);
        }
      }
    }

    if (sectionLinks.size > 0) {
      const rankedLinks = Array.from(sectionLinks.entries())
        .map(([name, url], idx) => `\n🔗 ${idx + 1}. [${name}](${url})`)
        .join('\n');
      aiReply += `\n\n📌 **You may find more info in these sections:**\n${rankedLinks}`;
    }

    res.json({ text: aiReply });
  } catch (err) {
    console.error('❌ Error during chat:', err.message)
    res.status(500).json({ text: 'Internal server error.', error: err.message })
  }
})

app.get('/sections', async (req, res) => {
  try {
    let roleIds = req.query.roleIds
      ? req.query.roleIds.split(',').map(id => parseInt(id.trim(), 10)).filter(Boolean)
      : [2, 10, 7];
    console.log('Requested roleIds:', roleIds);
    const sectionHierarchy = await getSectionHierarchyString(roleIds);
    res.json({ sections: sectionHierarchy });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch section list' });
  }
});

async function startup(roleIds) {
  try {
    await initializeRoleNames();
    sectionHierarchy = await getSectionHierarchyString(roleIds);

    // Load all data sources in parallel
    await Promise.all([
      loadSectionEmbeddings(),
      loadAndEmbedDocuments(),
      loadAllFaqVectors() // Now properly imported
    ]);

    console.log('📊 Startup Summary:');
    console.log(`- Policies: ${documentChunks.length} chunks`);
    console.log(`- Sections: ${sectionEmbeddings.length} embeddings`);
    console.log(`- Employee FAQs: ${faqVectorsEmp.length}`);
    console.log(`- Manager FAQs: ${faqVectorsMgr.length}`);
    console.log(`- HR FAQs: ${faqVectorsHr.length}`);

    app.listen(port, '0.0.0.0', () => {
      let hostURL;

      if (env === 'development') {
        hostURL = `http://localhost:${port}`;
      } else {
        hostURL = `http://0.0.0.0:${port}`;

      } console.log(`🚀 Server running on http://localhost:${port}`)
    });
  } catch (err) {
    console.error('❌ Startup failed:', err);
    process.exit(1);
  }
}
// app.post('/startup', async (req,) => {
//   let { roleIds } = req.body;

//   // Normalize roleIds to an array of numbers
//   if (typeof roleIds === 'string') {
//     roleIds = roleIds.split(',').map(Number);
//   } else if (Array.isArray(roleIds)) {
//     roleIds = roleIds.map(Number);
//   } else {
//     // Fallback in case something unexpected comes in
//     roleIds = [2, 10, 7];
//   }
//   startup(roleIds)

// })
startup([2, 10, 7]) // Default roles if not specified
  .catch(err => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  });