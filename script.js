// 1. Состояние игры
const scores = {
  clan1: 0,
  clan2: 0
};

let currentEraKey = null;

const eraNames = {
  paleolithic: 'Палеолит в Казахстане (Шакпакаты, Каратау, древнейшие орудия)',
  mesolithic: 'Мезолит в Казахстане (Тельманка, микролиты, лук и стрелы)',
  neolithic: 'Неолит в Казахстане (Сексеул, Атбасарская культура, керамика)',
  eneolithic: 'Энеолит в Казахстане (Ботайская культура, одомашнивание лошадей)'
};

// 2. Функция получения API-ключа
function getApiKey() {
  let key = localStorage.getItem("gemini_api_key");
  
  if (!key || key.trim() === "") {
    key = prompt("Введите ваш Gemini API Key (начинается на AIza...):");
    if (key && key.trim() !== "") {
      localStorage.setItem("gemini_api_key", key.trim());
    } else {
      alert("Без API-ключа генерация ИИ работать не будет!");
      return null;
    }
  }
  return key;
}

// Небольшая пауза (для повторных попыток)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 3. Запрос к Gemini API (с автоматическими повторными попытками при перегрузке)
async function askGemini(promptText, isJson = false, retries = 3) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key отсутствует");

  const MODEL_NAME = "gemini-2.5-flash"; // стабильная модель
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
          alert("Недействительный API-ключ или ошибка доступа. Ключ сброшен, введите новый.");
          throw new Error(data.error?.message || `Ошибка сервера: ${response.status}`);
        }

        // 503 / 429 — модель перегружена, пробуем ещё раз
        if ((response.status === 503 || response.status === 429) && attempt < retries) {
          console.warn(`Модель перегружена (попытка ${attempt}/${retries}), повтор через ${attempt}с...`);
          await sleep(attempt * 1000);
          continue;
        }

        console.error("Ошибка Google API:", data);
        throw new Error(data.error?.message || `Ошибка сервера: ${response.status}`);
      }

      return data.candidates[0].content.parts[0].text;

    } catch (error) {
      if (attempt === retries) {
        console.error("Ошибка при вызове Gemini API:", error);
        throw error;
      }
      // если это была сетевая ошибка (не наша преднамеренная), тоже пробуем ещё раз
      await sleep(attempt * 1000);
    }
  }
}

// 4. Генерация викторины
async function generateAIQuestion(eraKey) {
  const eraInfo = eraNames[eraKey] || 'Каменный век в Казахстане';
  
  const promptText = `
    Ты эксперт по истории Казахстана. Создай 1 уникальный тестовый вопрос для школы по теме "${eraInfo}".
    
    Верни ответ СТРОГО в формате JSON:
    {
      "question": "Текст вопроса",
      "options": ["Вариант 1", "Вариант 2", "Вариант 3"],
      "correct": 0
    }
    Где "correct" — индекс правильного ответа (0, 1 или 2).
  `;

  const rawResponse = await askGemini(promptText, true);
  return JSON.parse(rawResponse);
}

// 5. Клик по карте
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
    if (quizQuestion) quizQuestion.innerText = "⏳ ИИ генерирует уникальный вопрос по этой эпохе...";
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
      if (quizQuestion) quizQuestion.innerText = "Не удалось сгенерировать вопрос. Модель перегружена или ошибка ключа — попробуйте нажать на регион ещё раз через минуту.";
    }
  });
});

// 6. Проверка ответа
function handleAnswer(selectedIndex, correctIndex, regionElement) {
  if (selectedIndex === correctIndex) {
    const winningClan = prompt('Правильно! Какое племя получает территорию? Введите 1 (Охотники) или 2 (Собиратели):');

    if (winningClan === '1') {
      regionElement.style.fill = '#991b1b';
      scores.clan1 += 150;
    } else if (winningClan === '2') {
      regionElement.style.fill = '#d97706';
      scores.clan2 += 150;
    }

    const clan1Elem = document.getElementById('score-clan1');
    const clan2Elem = document.getElementById('score-clan2');
    if (clan1Elem) clan1Elem.innerText = `${scores.clan1} очков`;
    if (clan2Elem) clan2Elem.innerText = `${scores.clan2} очков`;

    alert('Отличный ответ! Теперь сгенерируйте и проверьте эссе для получения дополнительных баллов.');
  } else {
    alert('Неверно! Изучите материалы эпохи и попробуйте снова.');
  }
}

// 7. Генерация эссе
const genEssayBtn = document.getElementById('generate-essay-btn');
if (genEssayBtn) {
  genEssayBtn.onclick = async () => {
    const topicText = document.getElementById('essay-topic');
    const eraBadgeElem = document.getElementById('era-badge');
    const eraBadge = eraBadgeElem ? eraBadgeElem.innerText : '';

    if (!eraBadge) {
      alert("Сначала выберите эпоху на карте!");
      return;
    }

    if (topicText) topicText.innerText = "⏳ ИИ генерирует тему эссе...";

    const promptText = `Представь, что ты профессиональный историк. Напиши 1 тему эссе по истории Казахстана в эпоху "${eraBadge}". Сформулируй только тему без вводных фраз.`;

    try {
      const aiResponse = await askGemini(promptText);
      if (topicText) topicText.innerText = aiResponse;
    } catch (error) {
      console.error(error);
      if (topicText) topicText.innerText = "Ошибка генерации задания.";
    }
  };
}

// 8. Оценка эссе
const checkEssayBtn = document.getElementById('check-essay-btn');
if (checkEssayBtn) {
  checkEssayBtn.onclick = async () => {
    const essayInputElem = document.getElementById('essay-input');
    const essayText = essayInputElem ? essayInputElem.value : '';
    const feedbackBox = document.getElementById('ai-feedback');
    const topicElem = document.getElementById('essay-topic');
    const topic = topicElem ? topicElem.innerText : '';

    if (!essayText.trim()) {
      alert("Вставьте текст эссе!");
      return;
    }

    if (feedbackBox) {
      feedbackBox.classList.remove('hidden');
      feedbackBox.innerText = "⏳ ИИ-Эксперт оценивает работу...";
    }

    const promptText = `
      Ты эксперт по истории Казахстана. Оцени эссе ученика.
      Тема: "${topic}".
      Текст: "${essayText}".
      
      Формат ответа:
      🏆 Оценка: [Баллы от 1 до 100]
      ✅ Сильные стороны: [1-2 предложения]
      💡 Что можно улучшить: [1-2 предложения]
    `;

    try {
      const evaluation = await askGemini(promptText);
      if (feedbackBox) feedbackBox.innerText = evaluation;
    } catch (error) {
      console.error(error);
      if (feedbackBox) feedbackBox.innerText = "Не удалось проверить эссе.";
    }
  };
}
