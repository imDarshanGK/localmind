export const PROMPTS = [
  "Write the opening paragraph of a mystery story set in a small town where it hasn't stopped raining for three weeks.",
  "Describe a character who is outwardly cheerful but hiding a secret—show, don't tell, in under 200 words.",
  "Write a dialogue-only scene between two siblings arguing about whether to sell their childhood home.",
  "Turn this premise into a vivid first line: the last library on Earth just received one new book.",
  "Write a poem in free verse about waking up somewhere unfamiliar and slowly remembering why.",
  "Outline a three-act structure for a sci-fi short story where memories can be legally traded.",
  "Explain the difference between `==` and `===` in JavaScript with a short example for each.",
  "Review this pattern for bugs and suggest improvements: async function fetchAll(urls) { return urls.map(u => fetch(u)); }",
  "How do I write a Python function that reads a CSV and returns the top 5 rows by a numeric column?",
  "What is a race condition? Give a minimal example in pseudocode and one way to prevent it.",
  "Help me design REST API endpoints for a simple todo app (CRUD) and list expected request/response shapes.",
  "Debug step-by-step: my React component re-renders infinitely when I call setState inside useEffect with no dependency array—why?",
  "Teach me the basics of photosynthesis as if I'm 12, then give one follow-up question to check my understanding.",
  "Create a 7-day study plan to learn Git from zero to comfortable daily use.",
  "Explain supply and demand with a real-world example and one common misconception.",
  "What is the difference between machine learning, deep learning, and AI? Use analogies, not jargon.",
  "Quiz me on five European capitals: ask one at a time, wait for my answer, then give brief feedback.",
  "Summarize the causes of World War I in five bullet points, then suggest one reputable source to read next.",
  "Compare remote work vs. office work: list pros, cons, and who each model suits best.",
  "I'm choosing between two job offers. What factors should I weigh beyond salary?",
  "Analyze the strengths and weaknesses of using a monolith vs. microservices for a new startup MVP.",
  "Break down the argument in this claim: 'Social media always harms teenagers.' What evidence would strengthen or weaken it?",
  "Given monthly revenue [10k, 12k, 11k, 15k, 14k, 18k], describe the trend and what questions a founder should ask next.",
  "Perform a SWOT analysis for a local bakery considering online delivery.",
  "Summarize the uploaded document in three bullet points for a busy executive.",
  "What are the main conclusions in the document, and what evidence supports each one?",
  "List every date, deadline, or time-sensitive item mentioned in the document.",
  "Extract all named people, organizations, and their roles from the document.",
  "Explain the document in simple terms for someone with no background in the subject.",
  "What questions does the document leave unanswered? Suggest three follow-up questions I should ask.",
];

export function pickRandomPromptIndex(excludeIndex = null) {
  const n = PROMPTS.length;
  if (n === 0) return null;
  if (n === 1) return 0;
  let index;
  do {
    index = Math.floor(Math.random() * n);
  } while (index === excludeIndex);
  return index;
}
