### 📝 Word Explanations

You are tasked with **generating Bengali meanings and simple English sentence usages** for English words provided in a JSON file.

---

### 📂 Input

- **Format**: JSON array, objects with:

  - `noteId` (number): Unique identifier.
  - `Word` (string): English word.
  - `English Meaning` (string): Concise English explanation.

- **Example**:

  ```json
  [
    {
      "noteId": 1748081367282,
      "Word": "Abettor",
      "English Meaning": "A person who encourages or assists someone to do something wrong, in particular to commit a crime"
    },
    {
      "noteId": 1748081367283,
      "Word": "Ability",
      "English Meaning": "Possession of the means or skill to do something"
    }
  ]
  ```

---

### ✅ Task

For each word in the input JSON:

1.  **Generate Bengali Meaning**:
    - Provide the word's Bengali meaning (use a dictionary if needed).
    - If multiple meanings exist, choose the best and most accurate one.
    - Focus on the word's meaning, not translating the English explanation.
2.  **Generate Sentence Usage**:
    - Construct a short, simple English sentence showing the word's usage in context.
    - Prioritize clarity and simplicity; avoid complex sentences.
3.  **Combine Results**:
    - Generate a new JSON object:
      - `Bengali Meaning` (string)
      - `Sentence Usage` (string)

---

### 📌 Output

- **Structure**: JSON array of objects:

  - `noteId` (copied from input)
  - `Bengali Meaning` (string)
  - `Sentence Usage` (string)

- **Example**:

  ```json
  [
    {
      "noteId": 1748081367282,
      "Bengali Meaning": "সহযোগী",
      "Sentence Usage": "The abettor helped the thief."
    },
    {
      "noteId": 1748081367283,
      "Bengali Meaning": "দক্ষতা",
      "Sentence Usage": "She has the ability to draw well."
    }
  ]
  ```

---

### ⚠️ Rules

1.  **Accuracy**:
    - `Bengali Meaning`: Reflect the word's essence, not the full English explanation.
    - `Sentence Usage`: Align with the word’s English meaning.
2.  **Clarity**:
    - `Bengali Meaning`: Use clear, standard Bengali.
    - `Sentence Usage`: Use short, simple sentences.
3.  **Focus**:
    - Convey the word’s meaning and usage effectively.
    - Avoid unnecessary elaboration.
4.  **Consistency**:
    - Maintain consistent tone and structure.
5.  **Output JSON**:
    - Strictly follow the output structure.
    - Avoid extra spaces, newlines, etc.

---

### 🔢 Steps

1.  **Start**:
    - Read/parse the input JSON.
2.  **For Each Word**:
    - Copy `noteId`.
    - Analyze `Word` and `English Meaning`.
    - Generate `Bengali Meaning`.
    - Write simple `Sentence Usage`.
3.  **Construct Output**:
    - Combine `noteId`, `Bengali Meaning`, and `Sentence Usage`.
4.  **Complete**:
    - Compile output objects into a JSON array.
5.  **End**:
    - Generate the output JSON.
