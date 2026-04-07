import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required to generate questions.');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TOPICS = [
  { section: 'english', topic: 'Production of Writing' },
  { section: 'english', topic: 'Knowledge of Language' },
  { section: 'english', topic: 'Punctuation' },
  { section: 'english', topic: 'Grammar & Usage' },
  { section: 'english', topic: 'Sentence Structure' },
  { section: 'math', topic: 'Number & Quantity' },
  { section: 'math', topic: 'Algebra' },
  { section: 'math', topic: 'Functions' },
  { section: 'math', topic: 'Geometry' },
  { section: 'math', topic: 'Statistics & Probability' },
  { section: 'math', topic: 'Integrating Skills' },
  { section: 'reading', topic: 'Literary Narrative' },
  { section: 'reading', topic: 'Social Science' },
  { section: 'reading', topic: 'Humanities' },
  { section: 'reading', topic: 'Natural Science' },
  { section: 'science', topic: 'Data Representation' },
  { section: 'science', topic: 'Research Summaries' },
  { section: 'science', topic: 'Conflicting Viewpoints' },
];

async function generateQuestions(section, topic) {
  console.log(`generating: ${section} — ${topic}`);

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    max_output_tokens: 2200,
    input: `Generate 5 ACT-style multiple choice questions for the ${section} section, topic: "${topic}".

Return ONLY a JSON array, no other text. Each question must follow this exact format:
[
  {
    "section": "${section}",
    "topic": "${topic}",
    "difficulty": "medium",
    "question_text": "the full question text here",
    "choices": {
      "A": "first choice",
      "B": "second choice", 
      "C": "third choice",
      "D": "fourth choice"
    },
    "correct_answer": "A",
    "explanation": "explanation of why A is correct and why the others are wrong"
  }
]

Make the questions realistic and at ACT difficulty level. For English, include a passage excerpt if needed. For Math, include actual numbers and calculations. For Reading, create a short passage. For Science, reference a simple experiment or data set.`
  });

  const text = response.output_text;
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function main() {
  const allQuestions = [];
  
  for (const { section, topic } of TOPICS) {
    try {
      const questions = await generateQuestions(section, topic);
      allQuestions.push(...questions);
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`failed: ${section} ${topic}`, e.message);
    }
  }

  console.log('\n\n--- COPY THIS SQL ---\n');
  console.log('insert into questions (section, topic, difficulty, question_text, choices, correct_answer, explanation) values');
  
  const values = allQuestions.map(q => 
    `('${q.section}', '${q.topic}', '${q.difficulty}', '${q.question_text.replace(/'/g, "''")}', '${JSON.stringify(q.choices).replace(/'/g, "''")}', '${q.correct_answer}', '${q.explanation.replace(/'/g, "''")}')`
  );
  
  console.log(values.join(',\n') + ';');
  console.log('\n--- END SQL ---');
}

main();
