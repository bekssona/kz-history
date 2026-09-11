// Подсчет очков племен
const scores = {
  clan1: 0,
  clan2: 0
};

let currentEraKey = null;

// Названия эпох для контекста ИИ
const eraNames = {
  paleolithic: 'Палеолит в Казахстане (Шакпакаты, Каратау, древнейшие орудия)',
  mesolithic: 'Мезолит в Казахстане (Тельманка, микролиты, лук и стрелы)',
  neolithic: 'Неолит в Казахстане (Сексеул, Атбасарская культура, керамика)',
  eneolithic: 'Энеолит в Казахстане (Ботайская культура, одомашнивание лошадей)'
};

// Функция получения API-ключа у пользователя
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

// Универсальная функция обращения к Gemini API
async function askGemini(promptText, isJson = false) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key отсутствует");

  // ИСПРАВЛЕНО: Актуальное название модели
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{ parts: [{ text: promptText }] }]
  };

  // Запрашиваем чистый JSON, если это требуется
  if (isJson) {
    requestBody.generationConfig = { responseMimeType: "application/json" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        localStorage.removeItem("gemini_api_key");
        alert("Недействительный API-ключ. Обновите страницу и введите правильный ключ.");
      }
      console.error("Ошибка Google API:", data);
      throw new Error(data.error?.message || `Ошибка сервера: ${response.status}`);
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Ошибка при вызове Gemini API:", error);
    throw error;
  }
}

// Генерация викторины с помощью ИИ
async function generateAIQuestion(eraKey) {
  const eraInfo = eraNames[eraKey] || 'Каменный век в Казахстане';
  
  const promptText = `
    Ты эксперт по истории Казахстана. Создай 1 уникальный тестовый вопрос для школы по теме "${eraInfo}".
    
    Верни ответ СТРОГО в формате JSON со следующими полями:
    {
      "question": "Текст вопроса",
      "options": ["Вариант 1", "Вариант 2", "Вариант 3"],
      "correct": 0
    }
    Где "correct" — индекс правильного ответа (0, 1 или 2).
  `;

  // ИСПРАВЛЕНО: Передаем второй параметр true для гарантированного получения JSON
  const rawResponse = await askGemini(promptText, true);
  return JSON.parse(rawResponse);
}

// Обработка кликов по карте
document.querySelectorAll('.land').forEach(region => {
  region.addEventListener('click', async (e) => {
    currentEraKey = e.target.id;
    const eraTitle = eraNames[currentEraKey];

    if (!eraTitle) return;

    const quizBox = document.getElementById('quiz-box');
    const eraBadge = document.getElementById('era-badge');
    const quizTitle = document.getElementById('quiz-title');
    const quizQuestion = document.getElementById('quiz-question');
    const quizOptions = document.getElementById('quiz-options');
    const feedbackBox = document.getElementById('ai-feedback');

    quizBox.classList.remove('hidden');
    eraBadge.innerText = currentEraKey.toUpperCase();
    quizTitle.innerText = eraTitle.split('(')[0];
    quizQuestion.innerText = "⏳ ИИ генерирует уникальный вопрос по этой эпохе...";
    quizOptions.innerHTML = '';
    
    if (feedbackBox) feedbackBox.classList.add('hidden');

    try {
      const qData = await generateAIQuestion(currentEraKey);

      quizQuestion.innerText = qData.question;

      qData.options.forEach((optionText, index) => {
        const button = document.createElement('button');
        button.className = 'w-full text-left p-2.5 bg-stone-700 hover:bg-stone-600 rounded text-sm transition text-stone-200 font-medium mb-1';
        button.innerText = `${index + 1}. ${optionText}`;
        button.onclick = () => handleAnswer(index, qData.correct, e.target);
        quizOptions.appendChild(button);
      });

    } catch (error) {
      console.error(error);
      quizQuestion.innerText = "Не удалось сгенерировать вопрос. Нажмите на регион еще раз.";
    }
  });
});

// Проверка ответа викторины
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

    document.getElementById('score-clan1').innerText = `${scores.clan1} очков`;
    document.getElementById('score-clan2').innerText = `${scores.clan2} очков`;

    alert('Отличный ответ! Теперь сгенерируйте и проверьте эссе для получения дополнительных баллов.');
  } else {
    alert('Неверно! Изучите материалы эпохи и попробуйте снова.');
  }
}

// Генерация задания для эссе
document.getElementById('generate-essay-btn').onclick = async () => {
  const topicText = document.getElementById('essay-topic');
  const eraBadge = document.getElementById('era-badge').innerText;

  if (!eraBadge) {
    alert("Сначала выберите эпоху на карте!");
    return;
  }

  topicText.innerText = "⏳ ИИ генерирует уникальное историческое эссе...";

  const promptText = `Представь, что ты профессиональный эссеист и историк. Напиши тему эссе по истории Казахстана для школы в эпохе "${eraBadge}". Тема должна быть интересной и стимулировать критическое мышление (напиши только саму тему без вводных слов).`;

  try {
    const aiResponse = await askGemini(promptText);
    topicText.innerText = aiResponse;
  } catch (error) {
    console.error(error);
    topicText.innerText = "Ошибка генерации задания.";
  }
};

// Проверка эссе
document.getElementById('check-essay-btn').onclick = async () => {
  const essayText = document.getElementById('essay-input').value;
  const feedbackBox = document.getElementById('ai-feedback');
  const topic = document.getElementById('essay-topic').innerText;

  if (!essayText.trim()) {
    alert("Вставьте текст эссе!");
    return;
  }

  feedbackBox.classList.remove('hidden');
  feedbackBox.innerText = "⏳ ИИ-Эксперт оценивает работу...";

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
    feedbackBox.innerText = evaluation;
  } catch (error) {
    console.error(error);
    feedbackBox.innerText = "Не удалось проверить эссе.";
  }
};
