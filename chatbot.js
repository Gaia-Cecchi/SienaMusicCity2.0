class EventiChatbot {
    // Constants
    static MODEL = "llama3-70b-8192";
    static MAX_HISTORY = 6;
    static MIN_SEARCH_TERM_LENGTH = 3;

    constructor(events) {
        // Initialize core properties
        this.events = this.preprocessEvents(events);
        this.conversationHistory = [];
        this.currentDate = new Date('2025-02-06T16:18:42Z');
        this.currentUser = 'Gaia-Cecchi';
        this.apiKey = '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';
        this.initialized = false;

        // Cache DOM elements
        this.elements = this.cacheDOMElements();
        
        // Clear chat messages
        if (this.elements.chatMessages) {
            this.elements.chatMessages.innerHTML = '';
        }

        this.setupEventListeners();
        this.addWelcomeMessage();
    }

    // Pre-process events for faster searching
    preprocessEvents(events) {
        return events.map(event => ({
            ...event,
            searchText: `${event.title} ${event.extendedProps.location} ${event.extendedProps.description}`.toLowerCase(),
            date: new Date(event.start)
        }));
    }

    // Cache DOM elements for better performance
    cacheDOMElements() {
        return {
            chatMessages: document.getElementById('chat-messages'),
            chatInput: document.getElementById('chat-input'),
            sendButton: document.getElementById('send-message'),
            toggleButton: document.getElementById('toggle-chat'),
            chatWidget: document.getElementById('chat-widget')
        };
    }

    setupEventListeners() {
        const { chatInput, sendButton, toggleButton, chatWidget } = this.elements;

        if (sendButton) {
            sendButton.addEventListener('click', () => this.handleUserMessage());
        }

        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleUserMessage();
                }
            });
        }

        if (toggleButton && chatWidget) {
            toggleButton.addEventListener('click', () => {
                chatWidget.classList.toggle('minimized');
            });
        }
    }

    addWelcomeMessage() {
        if (!this.initialized) {
            this.addMessage('Ciao! Sono Alice, la tua guida agli eventi di Siena! 🎭 Come posso aiutarti?', 'bot');
            this.initialized = true;
        }
    }

    async handleUserMessage() {
        const { chatInput } = this.elements;
        if (!chatInput) return;

        const message = chatInput.value.trim();
        if (!message) return;

        this.addMessage(message, 'user');
        chatInput.value = '';

        const typingIndicator = this.addTypingIndicator();

        try {
            const response = await this.generateResponse(message);
            this.addMessage(response, 'bot');
        } catch (error) {
            console.error('Error:', error);
            this.addMessage("Mi dispiace, puoi ripetere in altro modo?", 'bot');
        } finally {
            typingIndicator.remove();
        }
    }

    async generateResponse(message) {
        // First message greeting check
        if (this.isBasicGreeting(message) && this.conversationHistory.length === 0) {
            return "Come posso aiutarti a trovare eventi interessanti?";
        }

        // Event-related query check
        if (this.isEventRelatedQuery(message)) {
            return this.searchLocalEvents(message);
        }

        // API fallback
        try {
            const response = await this.getGroqResponse(message);
            if (this.isValidResponse(response)) {
                return response;
            }
        } catch (error) {
            console.error('API Error:', error);
        }

        return this.getGenericResponse();
    }

    isValidResponse(response) {
        return response && 
               response.trim() && 
               !response.toLowerCase().includes("ciao! sono alice");
    }

    isBasicGreeting(message) {
        const greetings = new Set(['ciao', 'hey', 'buongiorno', 'buonasera', 'salve', 'hi', 'hello']);
        return greetings.has(message.toLowerCase().trim());
    }

    async getGroqResponse(userMessage) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: EventiChatbot.MODEL,
                messages: [
                    {
                        role: "system",
                        content: this.getSystemPrompt()
                    },
                    ...this.conversationHistory,
                    {
                        role: "user",
                        content: userMessage
                    }
                ],
                temperature: 0.6,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const botResponse = data.choices[0].message.content;
        this.updateConversationHistory(userMessage, botResponse);
        return botResponse;
    }

    updateConversationHistory(userMessage, botResponse) {
        this.conversationHistory.push(
            { role: "user", content: userMessage },
            { role: "assistant", content: botResponse }
        );

        // Keep only the last MAX_HISTORY messages
        if (this.conversationHistory.length > EventiChatbot.MAX_HISTORY) {
            this.conversationHistory = this.conversationHistory.slice(-EventiChatbot.MAX_HISTORY);
        }
    }

    getSystemPrompt() {
        return `Sei Alice, un'assistente virtuale amichevole e appassionata di Siena e della sua cultura.
            La data corrente è ${this.currentDate.toLocaleString('it-IT')}. 
            È FONDAMENTALE che tu consideri SOLO gli eventi che avvengono da questa data in poi.
            NON menzionare MAI eventi che avverranno tra più di un mese da oggi.

            IL TUO CARATTERE:
            - Sei entusiasta della cultura senese e lo dimostri nel modo in cui ne parli
            - Usi un linguaggio informale ma professionale
            - Fai spesso riferimenti personali a Siena e ai suoi luoghi
            - Mostri empatia e comprensione verso gli interessi dell'utente
            - Non ti limiti a elencare fatti, ma racconti storie e crei connessioni

            CONOSCENZA DI BASE:
            ${this.prepareEventsContext()}

            REGOLE IMPORTANTI:
            1. Rispondi SEMPRE in modo BREVE e CONCISO
            2. MAI salutare o presentarti di nuovo dopo il primo messaggio
            3. Parla SOLO di eventi dopo il ${this.currentDate.toLocaleDateString('it-IT')}
            4. Concentrati sui prossimi 7 giorni
            5. Se non ci sono eventi, suggerisci di controllare più avanti
            6. NON inventare eventi
            7. NON essere prolissa
            8. NON ripetere informazioni
            9. Puoi usare qualche emoticon dove serve, ma senza esagerare
            
            Data corrente: ${this.currentDate.toLocaleString('it-IT')}`;
    }

    prepareEventsContext() {
        const today = new Date(this.currentDate);
        today.setHours(0, 0, 0, 0);

        const todayEvents = [];
        const futureEvents = [];

        for (const event of this.events) {
            const eventDate = new Date(event.date);
            eventDate.setHours(0, 0, 0, 0);
            
            if (eventDate.getTime() === today.getTime()) {
                todayEvents.push(event);
            } else if (eventDate > today) {
                futureEvents.push(event);
                if (futureEvents.length >= 5) break; // Limit future events to 5
            }
        }

        return `
            EVENTI DI OGGI (${today.toLocaleDateString('it-IT')}):
            ${this.formatEventsList(todayEvents)}

            PROSSIMI EVENTI:
            ${this.formatEventsList(futureEvents)}`;
    }

    formatEventsList(events) {
        if (!events.length) return 'Nessun evento programmato.';
        
        return events.map(event => 
            `Titolo: ${event.title}
            Data: ${event.date.toLocaleDateString('it-IT')}
            Luogo: ${event.extendedProps.location || 'Non specificato'}
            Orario: ${event.extendedProps.time || 'Non specificato'}
            ${event.extendedProps.price ? `Prezzo: ${event.extendedProps.price}` : ''}`
        ).join('\n\n');
    }

    isEventRelatedQuery(message) {
        const eventKeywords = new Set([
            'evento', 'eventi', 'concerto', 'mostra', 'spettacolo', 
            'oggi', 'domani', 'quando', 'dove', 'programma', 'calendario'
        ]);
        return message.toLowerCase().split(' ').some(word => eventKeywords.has(word));
    }

    searchLocalEvents(query) {
        query = query.toLowerCase();
        const today = new Date(this.currentDate);
        today.setHours(0, 0, 0, 0);

        // Today's events
        if (query.includes('oggi')) {
            const todayEvents = this.events.filter(event => 
                event.date.setHours(0, 0, 0, 0) === today.getTime()
            );

            if (todayEvents.length) {
                return this.formatSearchResults(todayEvents);
            }
            return "Oggi non ci sono eventi in programma. Vuoi scoprire i prossimi eventi?";
        }

        // Future events
        if (query.includes('prossim')) {
            const futureEvents = this.events
                .filter(event => event.date > today)
                .slice(0, 3);

            if (futureEvents.length) {
                return this.formatSearchResults(futureEvents);
            }
        }

        // General search
        const searchTerms = query.split(' ')
            .filter(term => term.length > EventiChatbot.MIN_SEARCH_TERM_LENGTH);
        
        if (!searchTerms.length) {
            return this.getGenericResponse();
        }

        const matchingEvents = this.events.filter(event =>
            searchTerms.some(term => event.searchText.includes(term))
        );

        if (matchingEvents.length) {
            return this.formatSearchResults(matchingEvents);
        }

        return "Mi dispiace, non ho trovato eventi che corrispondono alla tua ricerca. Posso aiutarti a trovare altri eventi?";
    }

    formatSearchResults(events) {
        return `Ho trovato questi eventi:\n\n${events.map(event =>
            `📅 ${event.title}\n` +
            `📆 Data: ${event.date.toLocaleDateString('it-IT')}\n` +
            `🏛️ Luogo: ${event.extendedProps.location}\n` +
            `⏰ Orario: ${event.extendedProps.time || 'Non specificato'}`
        ).join('\n\n')}`;
    }

    getGenericResponse() {
        const responses = [
            "Posso aiutarti a trovare eventi interessanti. Di che tipo di eventi sei interessato?",
            "Vuoi scoprire gli eventi in programma? Dimmi pure cosa ti interessa!",
            "Come posso aiutarti a trovare l'evento perfetto per te?"
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    addMessage(message, type) {
        const { chatMessages } = this.elements;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.innerHTML = message.replace(/\n/g, '<br>');
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    addTypingIndicator() {
        const { chatMessages } = this.elements;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing';
        typingDiv.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return typingDiv;
    }
}

// Export as a module
export function initChatbot(events) {
    if (events) {
        window.chatbot = new EventiChatbot(events);
        console.log('Chatbot initialized');
    }
}