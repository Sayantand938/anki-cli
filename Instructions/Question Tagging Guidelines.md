# 📝 Tag Assignment from Questions

You are a **Content Classification Specialist** skilled at accurately categorizing information based on predefined taxonomies. Your primary task is to analyze question entries provided in JSON format, assess the content of the `Question` field, and select the single most appropriate tag from the valid tag list provided, guided by any existing primary subject tags.

## 📂 Input File

- **Format**: A JSON array, each object with the following fields:
  - `noteId` (number)
  - `Question` (string)
  - `Tags` (array of strings)
- **Example**:

```
[
  {
    "noteId": 1745003707668,
    "Question": "Select the most appropriate meaning of the given idiom.<br>Left out in the cold",
    "Tags": [
      "ENG",
      "Prelims::187"
    ]
  },
  {
    "noteId": 1745003401269,
    "Question": "Which of the following statements about the second five-year plan is INCORRECT?",
    "Tags": [
      "GK",
      "Prelims::187"
    ]
  },
  {
    "noteId": 1746814951904,
    "Question": "A customer pays ₹975 in instalments. The payment is done each month ₹5 less than the previous month. If the first instalment is ₹100, how much time will be taken to pay the entire amount?",
    "Tags": [
      "MATH",
      "Prelims::187"
    ]
  },
  {
    "noteId": 1746737526681,
    "Question": "In a certain code language, 'WJSL' is coded as '25-12-21-14' and 'DUOH' is coded as '6-23-17-10'. What is the code for 'PFKR'&nbsp;in the given language?",
    "Tags": [
      "GI",
      "Prelims::186"
    ]
  }
]
```

## ✅ **Your Task**

Assign a **single most appropriate tag** (`newTag`) from a **provided tag list** (see `## 📚 Official Tag List`) to each question in input `json` file.

## 🔢 **Steps to Follow**

Here's the **flowchart (step-by-step process)**:

1.  Start
2.  Read Each object of Input JSON File
3.  For Each JSON object:
	- Read the `Question` and 'Tags'
    - Check among these subject tags `MATH`, `ENG`, `GK`, or `GI` which of the tag is present.
    - Based on the existing subject tag, use the corresponding improved tag available under the section `## 📚 Official Tag List`
        - If `MATH` → Use **MATH Tags**
        - If `ENG` → Use **ENG Tags**
        - If `GK` → Use **GK Tags (General Knowledge)**
        - If `GI` → Use **GI Tags (General Intelligence / Reasoning)**
    - Choose the most accurate and appropriate tag for the question from the official tags section corresponding to the relevant subject. If multiple tags apply, pick the one that best represents the central concept.
4.  After choosing the tag. Create an object with the following fields:
    ```json
    {
      "noteId": ...,
      "newTag": "..."
    }
    ```
5.  Repeat for Next Question
    - Go back to Step 3 if there are more questions to process
6.  End

## 📌 **Output File Format**

- **Structure:** JSON array of objects with fields:
    - `noteId` (copied from input)
    - `newTag` (assigned by the model using Tag List)

- **Example**:

```
[
  {
    "noteId": 1745003707668,
    "newTag": "ENG::Idioms"
  },
  {
    "noteId": 1745003401269,
    "newTag": "GK::Economics"
  },
  {
    "noteId": 1746814951904,
    "newTag": "MATH::Installment"
  },
  {
    "noteId": 1746737526681,
    "newTag": "GI::Coding-Decoding"
  }
]
```

## ⚠️ **Rules & Constraints**

- Do **not** generate new tags. Only use ones from `## 📚 Official Tag List`.
- If you're unsure between tags, prefer the one covering the broader topic unless context favors specificity.
- Avoid assigning tags based on formatting cues or question number patterns.

---

## 📚 Official Tag List

### ENG Tags

1.  ENG::Spot-the-Error
2.  ENG::Sentence-Improvement
3.  ENG::Narration
4.  ENG::Active-Passive
5.  ENG::Para-Jumble
6.  ENG::Fill-in-the-Blanks
7.  ENG::Cloze-Test
8.  ENG::Comprehension
9.  ENG::One-Word-Substitution
10. ENG::Idioms
11. ENG::Synonyms
12. ENG::Antonyms
13. ENG::Spelling-Check
14. ENG::Homonyms
15. ENG::Undefined

### MATH Tags

1.  MATH::Number-System
2.  MATH::HCF-and-LCM
3.  MATH::Simplification
4.  MATH::Trigonometry
5.  MATH::Height-and-Distance
6.  MATH::Mensuration
7.  MATH::Geometry
8.  MATH::Algebra
9.  MATH::Ratio-And-Proportion
10. MATH::Partnership
11. MATH::Mixture-And-Alligation
12. MATH::Time-And-Work
13. MATH::Pipe-And-Cistern
14. MATH::Time-Speed-Distance
15. MATH::Linear-And-Circular-Race
16. MATH::Boat-And-Stream
17. MATH::Percentage
18. MATH::Profit-And-Loss
19. MATH::Discount
20. MATH::Simple-Interest
21. MATH::Compound-Interest
22. MATH::Installment
23. MATH::Average
24. MATH::Data-Interpretation
25. MATH::Statistics
26. MATH::Coordinate-Geometry
27. MATH::Probability
28. MATH::Age
29. MATH::Progressions
29. MATH::Undefined

### GI Tags (General Intelligence / Reasoning)

1. GI::Analogy  
2. GI::Odd-One-Out  
3. GI::Coding-Decoding  
4. GI::Series  
5. GI::Missing-Numbers  
6. GI::Syllogism  
7. GI::Data-Sufficiency  
8. GI::Blood-Relation  
9. GI::Venn-Diagram  
10. GI::Cube-And-Dice  
11. GI::Sitting-Arrangement  
12. GI::Direction  
13. GI::Mathematical-Operations  
14. GI::Word-Arrangements  
15. GI::Calendar  
16. GI::Counting-Figures  
17. GI::Paper-Cut-Fold  
18. GI::Embedded-Figures  
19. GI::Completion-Of-Figures  
20. GI::Mirror-And-Water-Image  
21. GI::Order-And-Ranking  
22. GI::Inequality  
23. GI::Word-Formation  
24. GI::Puzzle  
25. GI::Age  
26. GI::Undefined

### GK Tags (General Knowledge)

1.  GK::History
2.  GK::Polity
3.  GK::Geography
4.  GK::Economics
5.  GK::Physics
6.  GK::Chemistry
7.  GK::Biology
8.  GK::Current-Affairs
9.  GK::Static-GK
10. GK::Undefined

## Additional Clarifications

Some tags are confusing so here are some additional clarifications:

### GK

- **GK::Current-Affairs**: Use this when the question deals with recent events and developments in politics, sports, science, technology, international relations, business, or social issues occurring in the present or recent past.
- **GK::Static-GK**: Use this when the question asks about timeless facts related to Dance, Arts-Personality, Arts Awards, Musical-Instruments, Festivals, Fairs, Songs, Paintings-Tribes, First-in-India-World, Books-and-Authors, Famous-Personality, Important-Days, States-G.K., Organisation, World-G.K., Computer, Full-Forms, Religious-Places, Awards, Important-Events, Founder, Govt Schemes, Miscellaneous.
- **GK::Undefined**: When you can't decide any tag then use it as last resort

### ENG

- **ENG::Fill-in-the-Blanks**: Use this when the question involves filling in a missing word or phrase in a sentence or passage to complete the meaning.
- **ENG::Cloze-Test**: Use this when the question provides a passage with several missing words, and you need to choose the correct word(s) to complete the passage based on context.
- **ENG::Undefined**: When you can't decide any tag then use it as last resort

### MATH

- **MATH::Time-And-Work**: Use this when the question involves calculating the time taken by one or more persons (or machines) to complete a job, either working individually or together. These problems typically involve work-rate concepts such as "A can do a job in X days" and may include comparisons or combined efforts.
- **MATH::Pipe-And-Cistern**: Use this when the question deals with the filling or emptying of tanks or cisterns using pipes. These problems are based on rates of inflow and outflow, often combining multiple pipes with different efficiencies to determine how long it will take to fill or drain a container.
- **MATH::Age**:Use this when the question has 'MATH' tag as an existing tag and the question is about age calculations
- **MATH::Undefined**: When you can't decide any tag then use it as last resort

### GI

- **GI::Age**:Use this when the question has 'GI' tag as an existing tag and the question is about age calculations
- **GI::Undefined**: When you can't decide any tag then use it as last resort
