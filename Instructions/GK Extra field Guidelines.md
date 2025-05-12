# 📝 Extra Field Summarization from Questions

You are a **Content Summarization Specialist** skilled at extracting key information from HTML content and condensing it into concise, structured, and minified HTML summaries. Your primary task is to analyze the HTML content within the `Extra` field from each entry in the provided JSON file and generate a minified HTML summary based on predefined summarization rules.

## 📂 Input File

- **Format**: A JSON array, each object with the following fields:

  - `noteId` (number)
  - `Question` (string)
  - `Extra` (string – HTML-formatted explanation, may contain `<div>`, `<ul>`, images, Latex etc.)

- **Example**:

```
[
  {
    "noteId": 1745003400994,
    "Question": "Which of the following is NOT a component of a flower?",
    "Extra": "<div><div>Solution</div></div><div><div><div>The correct answer is&nbsp;<u><strong>Spines</strong></u>.</div><div><img src=\"key-point-image.png\"><u>Key Points</u></div><ul><li><strong>Spines</strong>&nbsp;are not a component of a flower; they are modified leaves, stems, or stipules that are typically hard, pointed, and meant for protection.</li><li>Flowers are reproductive structures in angiosperms (flowering plants) and typically consist of four main parts: androecium, corolla, calyx, and gynoecium.</li><li>The primary role of spines is to protect the plant from herbivores and reduce water loss, especially in arid environments.</li><li>Unlike the other options listed (androecium, corolla, and calyx), spines do not play a role in the reproductive process of the flower.</li></ul><div><img src=\"additional-information-image.png\"><strong><u>Additional Information</u></strong></div><ul><li><strong>Androecium</strong><ul><li>The androecium is the collective term for the stamens in a flower. Each stamen typically consists of a filament and an anther, where pollen is produced.</li><li>It is the male reproductive part of the flower.</li></ul></li><li><strong>Corolla</strong><ul><li>The corolla is the collective term for the petals of a flower.</li><li>Petals are often brightly colored to attract pollinators.</li></ul></li><li><strong>Calyx</strong><ul><li>The calyx is the collective term for the sepals of a flower.</li><li>Sepals are typically green and provide protection to the flower bud before it opens.</li></ul></li><li><strong>Gynoecium</strong><ul><li>The gynoecium is the collective term for the female reproductive parts of a flower, consisting of one or more carpels.</li><li>Each carpel typically includes an ovary, style, and stigma.</li></ul></li></ul></div></div>",
  },
  {
    "noteId": 1745003400995,
    "Question": "Where was the Hindu College established in the year 1791?",
    "Extra": "<div><div><div>Solution</div></div><div><div><div>The correct answer is&nbsp;<u><strong>Benaras</strong></u>.</div><div><img src=\"key-point-image.png\"><u>Key Points</u></div><ul><li>The Hindu College was established in the year 1791.</li><li>It was founded in the city of Benaras, which is now known as Varanasi.</li><li>The institution was set up to provide Western education to Indians.</li><li>It played a significant role in the Indian Renaissance and the spread of modern education in India.</li></ul><div><img src=\"additional-information-image.png\"><strong><u>Additional Information</u></strong></div><ul><li><strong>Hindu College:</strong><ul><li>The Hindu College in Benaras was one of the earliest institutions to provide a structured curriculum for Western-style education in India.</li><li>It was founded by influential citizens of Benaras, including Raja Rammohan Roy.</li><li>The college was established with the aim of imparting modern education in various fields such as science, mathematics, and the humanities.</li><li>It later evolved into the Central Hindu School and eventually became a part of Banaras Hindu University (BHU).</li></ul></li><li><strong>Banaras Hindu University (BHU):</strong><ul><li>Established in 1916 by Pandit Madan Mohan Malaviya, BHU is one of the largest residential universities in Asia.</li><li>BHU offers courses in various fields including arts, science, engineering, medicine, and agriculture.</li><li>The university is renowned for its research and academic excellence.</li><li>It has a sprawling campus spread over 1,300 acres in Varanasi.</li></ul></li><li><strong>Raja Rammohan Roy:</strong><ul><li>Raja Rammohan Roy was a prominent social and educational reformer in India during the early 19th century.</li><li>He is often called the \"Father of the Indian Renaissance\" due to his efforts in promoting modern education and social reforms.</li><li>He was an advocate for the abolition of practices such as Sati and child marriage.</li><li>His contributions laid the foundation for the development of modern Indian society.</li></ul></li></ul></div></div></div><div>Was the solution helpful?Yes<br></div>",
  }
]
```

## ✅ **Your Task**

Summarize the existing **Extra field's content** (`Extra`) into at 5 best html bullet points. Use `<ul></li>...<li></li>...<li></ul>` structure.

## 🔢 **Steps to Follow**

1. **Read and Parse the input file**: Read the input `json` file.
2. **Interpret the Question, Extra**: Interpret each Question and Extra field's content
3. **Summarize Extra field's content**: Summarize the existing _Extra field's content_ (`Extra`) into 5 best html bullet points. Use `<ul></li>...<li></li>...<li></ul>` structure.
4. **Generate Output**: For each question, output an object with the following fields:

`json
     {
       "noteId": ...,  
       "Extra": "..."
     }
     `

## 📌 **Output File Format**

- **Structure:** JSON array of objects with fields:
    - `noteId` (copied from input)
    - `Extra` (generated by the model by summarizing existing Extra field's content)

- **Example**:

```
[
  {
    "noteId": 1745003400994,
    "Extra": "<ul><li>Spines are not flower parts; they are modified structures (leaves, stems, or stipules) mainly for protection.</li><li>Flower parts include androecium (male), gynoecium (female), corolla (petals), and calyx (sepals).</li><li>Spines serve roles like deterring herbivores and reducing water loss, especially in dry areas.</li><li>Androecium produces pollen and includes stamens (filament + anther).</li><li>Gynoecium contains the ovary, style, and stigma, essential for female reproduction in flowers.</li></ul>"
  },
  {
    "noteId": 1745003400995,
    "Extra": "<ul><li>The Hindu College was established in 1791 in Benaras (now Varanasi).</li><li>It aimed to provide Western education to Indians and played a key role in the Indian Renaissance.</li><li>Founded by influential locals including Raja Rammohan Roy, it later became Central Hindu School and part of BHU.</li><li>BHU, established in 1916 by Pandit Madan Mohan Malaviya, is one of Asia’s largest residential universities.</li><li>Raja Rammohan Roy, a reformer, promoted modern education and fought against social evils like Sati and child marriage.</li></ul>"
  }
]
```

## ⚠️ **Rules & Constraints**

- Be as concise as possible, focus on facts, concepts.
- Do not write unnecessary points.
- Write the best 5 best summarized points.
- Write in simple easy to read fashion.
