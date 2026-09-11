// 1. Game State
const scores = {
  clan1: 0,
  clan2: 0
};

let currentEraKey = null;

const eraNames = {
  paleolithic: 'Paleolithic in Kazakhstan (Shakpakaty, Karatau, ancient tools)',
  mesolithic: 'Mesolithic in Kazakhstan (Telmanka, microliths, bow and arrow)',
  neolithic: 'Neolithic in Kazakhstan (Sekseul, Atbasar culture, ceramics)',
  eneolithic: 'Eneolithic in Kazakhstan (Botai culture, horse domestication)'
};

// 2. API Key Retrieval
function getApiKey() {
  let key = localStorage.getItem("gemini_api_key");
  
  if (!key || key.trim() === "") {
    key = prompt("Enter your Gemini API Key (starts with AIza...):");
    if (key && key.trim() !== "") {
      localStorage.setItem("gemini_api_key", key.trim());
    } else {
      alert("AI generation will not work without an API key!");
      return null;
    }
  }
  return key;
}

// Short pause (for retry attempts)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 3. Gemini API Request (with automatic retries on overload)
async function askGemini(promptText, isJson = false, retries = 3) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");

  const MODEL_NAME = "gemini-3.6-flash"; // Current Google model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{ parts: [{ text: promptText }] }]
  };

  if (isJson) {
    requestBody.generationConfig = { responseMimeType: "application/json" };
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 404) {
          localStorage.removeItem("gemini_api_key");
          alert("Invalid API key or access error. Key reset, please enter a new one.");
          throw new Error(data.error?.message || `Server error: ${response.status}`);
        }

        // 503 / 429 — Model overloaded, retry
        if ((response.status === 503 || response.status === 429) && attempt < retries) {
          console.warn(`Model overloaded (attempt ${attempt}/${retries}), retrying in ${attempt}s...`);
          await sleep(attempt * 1000);
          continue;
        }

        console.error("Google API Error:", data);
        throw new Error(data.error?.message || `Server error: ${response.status}`);
      }

      return data.candidates[0].content.parts[0].text;

    } catch (error) {
      if (attempt === retries) {
        console.error("Error calling Gemini API:", error);
        throw error;
      }
      // If it was a network error, retry as well
      await sleep(attempt * 1000);
    }
  }
}

// 4. Quiz Generation
async function generateAIQuestion(eraKey) {
  const eraInfo = eraNames[eraKey] || 'Stone Age in Kazakhstan';
  
  const promptText = `
    You are an expert in the history of Kazakhstan. Create 1 unique school multiple-choice quiz question about "${eraInfo}".
    
    Return the response STRICTLY in JSON format:
    {
      "question": "Question text",
      "options": ["Option 1", "Option 2", "Option 3"],
      "correct": 0
    }
    Where "correct" is the index of the correct option (0, 1, or 2).
  `;

  const rawResponse = await askGemini(promptText, true);
  return JSON.parse(rawResponse);
}

// 5. Map Click Event
document.querySelectorAll('.land').forEach(region => {
  region.addEventListener('click', async (e) => {
    currentEraKey = e.currentTarget.id;
    const eraTitle = eraNames[currentEraKey];

    if (!eraTitle) return;

    const quizBox = document.getElementById('quiz-box');
    const eraBadge = document.getElementById('era-badge');
    const quizTitle = document.getElementById('quiz-title');
    const quizQuestion = document.getElementById('quiz-question');
    const quizOptions = document.getElementById('quiz-options');
    const feedbackBox = document.getElementById('ai-feedback');

    if (quizBox) quizBox.classList.remove('hidden');
    if (eraBadge) eraBadge.innerText = currentEraKey.toUpperCase();
    if (quizTitle) quizTitle.innerText = eraTitle.split('(')[0];
    if (quizQuestion) quizQuestion.innerText = "⏳ AI is generating a unique question for this era...";
    if (quizOptions) quizOptions.innerHTML = '';
    
    if (feedbackBox) feedbackBox.classList.add('hidden');

    try {
      const qData = await generateAIQuestion(currentEraKey);

      if (quizQuestion) quizQuestion.innerText = qData.question;

      if (quizOptions) {
        qData.options.forEach((optionText, index) => {
          const button = document.createElement('button');
          button.className = 'w-full text-left p-2.5 bg-stone-700 hover:bg-stone-600 rounded text-sm transition text-stone-200 font-medium mb-1';
          button.innerText = `${index + 1}. ${optionText}`;
          button.onclick = () => handleAnswer(index, qData.correct, e.currentTarget);
          quizOptions.appendChild(button);
        });
      }

    } catch (error) {
      console.error(error);
      if (quizQuestion) quizQuestion.innerText = "Failed to generate a question. The model is overloaded or there is a key error — try clicking the region again in a minute.";
    }
  });
});

// 6. Answer Verification
function handleAnswer(selectedIndex, correctIndex, regionElement) {
  if (selectedIndex === correctIndex) {
    const winningClan = prompt('Correct! Which clan gets the territory? Enter 1 (Hunters) or 2 (Gatherers):');

    if (winningClan === '1') {
      regionElement.style.fill = '#991b1b';
      scores.clan1 += 150;
    } else if (winningClan === '2') {
      regionElement.style.fill = '#d97706';
      scores.clan2 += 150;
    }

    const clan1Elem = document.getElementById('score-clan1');
    const clan2Elem = document.getElementById('score-clan2');
    if (clan1Elem) clan1Elem.innerText = `${scores.clan1} pts`;
    if (clan2Elem) clan2Elem.innerText = `${scores.clan2} pts`;

    alert('Great job! Now generate and review an essay to earn additional points.');
  } else {
    alert('Incorrect! Review the materials for this era and try again.');
  }
}

// 7. Essay Topic Generation
const genEssayBtn = document.getElementById('generate-essay-btn');
if (genEssayBtn) {
  genEssayBtn.onclick = async () => {
    const topicText = document.getElementById('essay-topic');
    const eraBadgeElem = document.getElementById('era-badge');
    const eraBadge = eraBadgeElem ? eraBadgeElem.innerText : '';

    if (!eraBadge) {
      alert("Please select an era on the map first!");
      return;
    }

    if (topicText) topicText.innerText = "⏳ AI is generating an essay topic...";

    const promptText = `Imagine you are a professional historian. Write 1 essay topic about the history of Kazakhstan during the "${eraBadge}" era. Provide only the topic without introductory phrases.`;

    try {
      const aiResponse = await askGemini(promptText);
      if (topicText) topicText.innerText = aiResponse;
    } catch (error) {
      console.error(error);
      if (topicText) topicText.innerText = "Failed to generate assignment.";
    }
  };
}

// 8. Essay Evaluation
const checkEssayBtn = document.getElementById('check-essay-btn');
if (checkEssayBtn) {
  checkEssayBtn.onclick = async () => {
    const essayInputElem = document.getElementById('essay-input');
    const essayText = essayInputElem ? essayInputElem.value : '';
    const feedbackBox = document.getElementById('ai-feedback');
    const topicElem = document.getElementById('essay-topic');
    const topic = topicElem ? topicElem.innerText : '';

    if (!essayText.trim()) {
      alert("Please paste the essay text!");
      return;
    }

    if (feedbackBox) {
      feedbackBox.classList.remove('hidden');
      feedbackBox.innerText = "⏳ AI Expert is evaluating the essay...";
    }

    const promptText = `
      You are an expert in the history of Kazakhstan. Evaluate the student's essay.
      Topic: "${topic}".
      Text: "${essayText}".
      
      Response format:
      🏆 Score: [Points from 1 to 100]
      ✅ Strengths: [1-2 sentences]
      💡 Areas for improvement: [1-2 sentences]
    `;

    try {
      const evaluation = await askGemini(promptText);
      if (feedbackBox) feedbackBox.innerText = evaluation;
    } catch (error) {
      console.error(error);
      if (feedbackBox) feedbackBox.innerText = "Failed to review the essay.";
    }
  };
}
