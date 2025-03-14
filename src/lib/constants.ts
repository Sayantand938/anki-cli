// src/lib/constants.ts

export const CUSTOM_STUDY_DECK = 'Custom Study Session';
export const OPENAI_MODEL = 'gpt-4o-mini'; // Add the model name here

export const VALID_TAGS: { [key: string]: string[] } = {
  ENG: [
    'Spot-Error',
    'Sentence-Improvement',
    'Narration',
    'Voice-Change',
    'Parajumble',
    'Fill-Blanks',
    'Cloze-Test',
    'Comprehension',
    'One-Word-Substitution',
    'Synonym',
    'Antonym',
    'Homonym',
    'Idioms',
    'Spelling-Check',
    'Undefined',
  ],
  MATH: [
    'Number-Systems',
    'Simple-Interest',
    'HCF-LCM',
    'Ratio',
    'Discount',
    'Time-Distance',
    'Profit-Loss',
    'Percentage',
    'Mixture',
    'Pipe-Cistern',
    'Height-Distance',
    'Compound-Interest',
    'Time-Work',
    'Average',
    'Boat-Stream',
    'Statistics',
    'Data-Interpretation',
    'Mensuration',
    'Trigonometry',
    'Geometry',
    'Simplification',
    'Algebra',
    'Probability',
    'Undefined',
  ],
  GI: [
    'Analogy',
    'Odd-One-Out',
    'Coding-Decoding',
    'Series',
    'Missing-Numbers',
    'Statement-And-Conclusion',
    'Blood-Relation',
    'Venn-Diagram',
    'Dice',
    'Sitting-Arrangements',
    'Direction',
    'Mathematical-Operations',
    'Word-Arrangement',
    'Age',
    'Calendar',
    'Figure-Counting',
    'Paper-Cut',
    'Embedded-Figure',
    'Mirror-Image',
    'Undefined',
  ],
  GK: [
    'History',
    'Geography',
    'Polity',
    'Economics',
    'Science',
    'Current-Affairs',
    'Static',
    'Undefined',
  ],
};

export const EXPLANATION_PROMPT_TEMPLATE = `
    Explain the reasoning briefly behind the correct answer to this grammar question. Mention the grammar rule used if applicable. Use bullet points for clarity. Keep it short and structured. Give the output in HTML format and wrap the output in <explanation></explanation> tags.

    Question: {question}
    Option 1: {op1}
    Option 2: {op2}
    Option 3: {op3}
    Option 4: {op4}
    Correct Answer: {correctAnswer}
`;

export const TAGGING_PROMPT_TEMPLATE = `
Choose a single best topic tag from the valid tag list below and answer in this format <tag><actual tag></tag>

Valid Tag List:
{validTags}

Additional Instructions:
{instructions}

Question: {question}
Option 1: {op1}
Option 2: {op2}
Option 3: {op3}
Option 4: {op4}
Correct Answer: {correctAnswer}
`;

export const TAGGING_INSTRUCTIONS: { [key: string]: string } = {
  ENG: 'If the question has multiple blank lines, then tag it as Cloze-Test.\n',
  MATH: 'If the question has some table/chart, then tag it as Data-Interpretation.\n',
  GK:
    'If a question is about dance or culture, tag it as Static.\n' +
    'If a question concerns an event from the last 10 years, tag it as Current-Affairs.\n' +
    'Use the History tag only for questions that are genuinely about history.\n' +
    'Use the Static tag for General Knowledge questions about facts that don’t change over time.\n' +
    'Use the Current-Affairs tag if a question is about sports.\n',
};
