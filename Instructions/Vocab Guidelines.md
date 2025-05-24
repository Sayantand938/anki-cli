### 📝 **Word Explanation Generation**

You are tasked with **generating Bengali meanings of words and simple sentence usages** for a given list of English words and their meanings provided in an input JSON file.

---

### 📂 **Input File**

- **Format**: A JSON array where each object contains the following fields:

  - `noteId` (number): A unique identifier for the entry.
  - `Word` (string): The English word.
  - `English Meaning` (string): A concise explanation of the word in English.

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

### ✅ **Your Task**

For each word in the input JSON:

1. **Generate Bengali Meaning**:

   - Provide the **Bengali meaning of the word** based on its usage and context.
   - IF there are multiple bengali meanings then choose the best and accurate one, use dictionary if needed.
   - Focus on capturing the meaning of the word itself, not translating the English explanation.

2. **Generate Simple Sentence Usage**:

   - Construct a short, **easy-to-understand sentence in English** that demonstrates the usage of the word in context.
   - Avoid long or complex sentences. Prioritize clarity and simplicity.

3. **Combine Results**:

   - For each word, generate a new JSON object containing:

     - `Bengali Meaning`: The Bengali meaning of the word.
     - `Sentence Usage`: The generated English sentence.

---

### 📌 **Output File Format**

- **Structure**: A JSON array of objects, each containing the fields:

  - `noteId` (copied from the corresponding input object)
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

### ⚠️ **Rules & Constraints**

1. **Accuracy**:

   - The **Bengali Meaning** must reflect the essence of the word itself, not the full explanation in English.
   - The **Sentence Usage** must align with the word’s English meaning.

2. **Clarity**:

   - Use clear, standard Bengali for the **Bengali Meaning**, suitable for a broad audience.
   - Write **short, simple sentences** for the Sentence Usage field. Avoid complex or multi-clause constructions.

3. **Focus**:

   - Focus solely on conveying the word’s meaning and usage effectively.
   - Avoid unnecessary elaboration in either the Bengali meaning or sentence usage.

4. **Consistency**:

   - Ensure consistent tone and structure across all entries.

5. **Output JSON Formatting**:

   - The output JSON should strictly follow the structure outlined above.
   - Avoid unnecessary spaces, newlines, or formatting discrepancies.

---

### 🔢 **Steps to Follow**

1. **Start**:

   - Read and parse the input JSON file.

2. **For Each Word**:

   - Copy the `noteId`.
   - Analyze the `Word` and `English Meaning`.
   - Generate a **Bengali Meaning** that directly corresponds to the word.
   - Write a **simple and clear Sentence Usage** showcasing the word in context.

3. **Construct Output**:

   - Combine the `noteId`, `Bengali Meaning`, and `Sentence Usage` into an output object.

4. **Complete**:

   - Compile all output objects into a JSON array.

5. **End**:

   - Generate the output JSON file.
