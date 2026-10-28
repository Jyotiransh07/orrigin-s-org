import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_SPECIALIZATIONS = [
  'General Physician', 'Cardiologist', 'Dermatologist', 
  'Pediatrician', 'Orthopedic', 'Neurologist', 
  'Gynecologist', 'ENT Specialist', 'Ophthalmologist', 
  'Gastroenterologist', 'Pulmonologist', 'Urologist',
  'Endocrinologist', 'Physiotherapist'
];

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // Server-side Gemini initialization
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const ai = apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })
    : null;

  // Endpoint: Medical Triage / Specialization Recommendation
  app.post('/api/triage', async (req: Request, res: Response) => {
    const { symptoms } = req.body;

    if (!symptoms || typeof symptoms !== 'string' || symptoms.trim().length === 0) {
      res.status(400).json({ error: 'Symptoms description is required.' });
      return;
    }

    if (!ai) {
      console.warn('GEMINI_API_KEY is not configured on the server. Falling back to default triage assessment.');
      res.json({
        specialization: 'General Physician',
        reason: 'A General Physician is the best first contact for a comprehensive physical evaluation and guided specialist referral.',
        urgency: 'medium',
        redFlags: [
          'Sudden severe chest pain or pressure',
          'Difficulty breathing or shortness of breath',
          'Sudden loss of consciousness or speech difficulty',
          'Severe or sudden allergic reaction',
        ],
      });
      return;
    }

    const triagePrompt = `Patient input: "${symptoms.trim()}". 
        
ROLE: You are an elite Clinical Triage Expert. Your goal is to guide the user to the single most appropriate medical specialist from the list provided.

ALLOWED SPECIALISTS:
${VALID_SPECIALIZATIONS.join('\n')}

SPECIALIST MAPPING RULES:
1. EYE PROBLEMS (blurry vision, redness, itching in eye, vision loss) -> Ophthalmologist.
2. EAR/NOSE/THROAT (ear pain, sinus, throat infection, hearing loss, tonsils) -> ENT Specialist.
3. BONES/JOINTS/MUSCLE INJURY (fracture, back pain, joint stiffness, arthritis) -> Orthopedic.
4. HEART/CHEST (palpitations, non-respiratory chest tightness, hypertension) -> Cardiologist.
5. SKIN/HAIR/NAILS (rash, acne, eczema, hair fall, moles) -> Dermatologist.
6. CHILDREN (<18 years old, pediatric symptoms) -> Pediatrician.
7. WOMEN'S HEALTH/PREGNANCY (menstrual issues, maternity, pelvic pain) -> Gynecologist.
8. STOMACH/DIGESTION/LIVER (acid reflux, severe abdominal pain, IBS, jaundice) -> Gastroenterologist.
9. BRAIN/NERVES (migraine, tremors, numbness, seizures, neuropathies) -> Neurologist.
10. LUNGS/BREATHING (asthma, chronic cough, COPD, bronchitis) -> Pulmonologist.
11. KIDNEY/URINARY (kidney stones, UTI, blood in urine) -> Urologist.
12. HORMONES/METABOLISM (diabetes, thyroid issues) -> Endocrinologist.
13. REHAB (mobility recovery, post-surgery physical therapy) -> Physiotherapist.
14. VAGUE/GENERAL (fever, chills, cold, general weakness, unspecific malaise) -> General Physician.

SAFETY PROTOCOL:
- Do NOT diagnose a specific disease.
- Use professional triage guidance: "Your symptoms align with conditions typically evaluated by a..."
- Identify critical red flags relevant to the described symptoms that require immediate emergency care.`;

    const modelConfig = {
      systemInstruction: 'You are a clinical navigation engine. You analyze patient symptoms and return the best doctor specialization from a fixed list. You prioritize safety and accuracy. You are professional, reassuring, and never provide a definitive medical diagnosis.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          specialization: {
            type: Type.STRING,
            description: 'The exact specialist name from the allowed list.',
          },
          reason: {
            type: Type.STRING,
            description: 'A 2-sentence professional explanation of why this specialist is appropriate.',
          },
          urgency: {
            type: Type.STRING,
            description: 'Clinical urgency level: low, medium, or high.',
          },
          redFlags: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: 'Emergency warning symptoms requiring immediate emergency department care.',
          },
        },
        required: ['specialization', 'reason', 'urgency', 'redFlags'],
      },
    };

    // Try fastest reliable model (gemini-3.1-flash-lite) first, then fallback to gemini-3.8-flash
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    let lastError: unknown = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: triagePrompt,
          config: modelConfig,
        });

        const text = response.text;
        if (!text) {
          throw new Error('Empty response received from AI model.');
        }

        const parsed = JSON.parse(text);
        if (!VALID_SPECIALIZATIONS.includes(parsed.specialization)) {
          const match = VALID_SPECIALIZATIONS.find(s => 
            s.toLowerCase().includes(parsed.specialization.toLowerCase()) ||
            parsed.specialization.toLowerCase().includes(s.toLowerCase())
          );
          parsed.specialization = match || 'General Physician';
        }

        res.json(parsed);
        return;
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} triage attempt failed, trying next candidate if available...`, err);
      }
    }

    console.error('All Gemini Triage model attempts failed:', lastError);
    res.json({
      specialization: 'General Physician',
      reason: 'Your symptoms warrant a clinical assessment. A General Physician is the best first contact for a primary physical examination and diagnostic roadmap.',
      urgency: 'medium',
      redFlags: [
        'Sudden severe chest pain',
        'Shortness of breath',
        'Fainting or severe dizziness',
        'Severe allergic reaction or facial swelling',
      ],
    });
  });

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'AarogyaAI' });
  });

  // Vite middleware in dev; static file serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AarogyaAI server running at http://localhost:${PORT}`);
  });
}

startServer();
